import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from 'jose';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import {
  optionalRecordClaim,
  optionalStringClaim,
  requireRecordClaim,
  requireStringClaim,
  requireTrimmedValue,
  resolveUserRole,
  validateLtiAudience,
} from './claim_support.ts';
import { resolveCanvasPlatform } from './canvas_platform.ts';
import { parseLaunchServiceClaims } from './launch_service_claims.ts';
import { resolveLaunchTarget } from './launch_target_resolution.ts';
import { createOpaqueToken, loadJwks } from './token_support.ts';
import type { ValidatedLaunch } from './types.ts';

const CLAIM_MESSAGE_TYPE = 'https://purl.imsglobal.org/spec/lti/claim/message_type';
const CLAIM_VERSION = 'https://purl.imsglobal.org/spec/lti/claim/version';
const CLAIM_DEPLOYMENT_ID = 'https://purl.imsglobal.org/spec/lti/claim/deployment_id';
const CLAIM_TARGET_LINK_URI = 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri';
const CLAIM_RESOURCE_LINK = 'https://purl.imsglobal.org/spec/lti/claim/resource_link';
const CLAIM_CONTEXT = 'https://purl.imsglobal.org/spec/lti/claim/context';
const CLAIM_CUSTOM = 'https://purl.imsglobal.org/spec/lti/claim/custom';
const CLAIM_ROLES = 'https://purl.imsglobal.org/spec/lti/claim/roles';
const CLAIM_LAUNCH_PRESENTATION = 'https://purl.imsglobal.org/spec/lti/claim/launch_presentation';

export async function validateLaunchRequest(input: {
  repository: PackageReviewRepository;
  state: string;
  idToken: string;
  now?: () => Date;
  createOpaqueToken?: () => string;
  loadJwks?: (url: string) => Promise<JSONWebKeySet>;
}): Promise<ValidatedLaunch> {
  const now = input.now ?? (() => new Date());
  const nextOpaqueToken = input.createOpaqueToken ?? createOpaqueToken;
  const loadLaunchJwks = input.loadJwks ?? loadJwks;
  const state = requireTrimmedValue(input.state, 'Launch state is required.');
  const idToken = requireTrimmedValue(input.idToken, 'Launch id_token is required.');
  const loginState = await input.repository.getLoginStateByState(state);

  if (!loginState) {
    throw new Error(`Login state ${state} was not found.`);
  }

  if (loginState.usedAt !== null) {
    throw new Error(`Login state ${state} has already been used.`);
  }

  if (Date.parse(loginState.expiresAt) <= now().getTime()) {
    throw new Error(`Login state ${state} has expired.`);
  }

  const platform = resolveCanvasPlatform(loginState.issuer);
  const jwks = await loadLaunchJwks(platform.jwksUrl);
  let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];

  try {
    const verified = await jwtVerify(idToken, createLocalJWKSet(jwks), {
      issuer: loginState.issuer,
      audience: loginState.clientId,
      currentDate: now(),
    });

    payload = verified.payload;
  } catch {
    throw new Error('Launch id_token signature or issuer validation failed.');
  }

  validateLtiAudience({
    aud: payload.aud,
    azp: payload.azp,
    clientId: loginState.clientId,
    subject: 'Launch',
  });

  const deploymentId = requireStringClaim(
    payload[CLAIM_DEPLOYMENT_ID],
    'Launch deployment_id is required.',
  );
  const targetLinkUri = requireStringClaim(
    payload[CLAIM_TARGET_LINK_URI],
    'Launch target_link_uri is required.',
  );
  const nonce = requireStringClaim(payload.nonce, 'Launch nonce is required.');
  const messageType = requireStringClaim(
    payload[CLAIM_MESSAGE_TYPE],
    'Launch message_type is required.',
  );
  const version = requireStringClaim(payload[CLAIM_VERSION], 'Launch LTI version is required.');

  if (deploymentId !== loginState.deploymentId) {
    throw new Error('Launch deployment_id did not match the saved login state.');
  }

  if (targetLinkUri !== loginState.targetLinkUri) {
    throw new Error('Launch target_link_uri did not match the saved login state.');
  }

  if (nonce !== loginState.nonce) {
    throw new Error('Launch nonce did not match the saved login state.');
  }

  if (messageType !== 'LtiResourceLinkRequest') {
    throw new Error(`Unsupported LTI message type ${messageType}.`);
  }

  if (version !== '1.3.0') {
    throw new Error(`Unsupported LTI version ${version}.`);
  }

  const deployment = await input.repository.getDeploymentByBinding({
    lms: 'canvas',
    issuer: loginState.issuer,
    clientId: loginState.clientId,
    deploymentId,
  });

  if (!deployment?.binding) {
    throw new Error(
      `Canvas deployment ${loginState.clientId} / ${deploymentId} was not found for issuer ${loginState.issuer}.`,
    );
  }

  const resourceLink = requireRecordClaim(
    payload[CLAIM_RESOURCE_LINK],
    'Launch resource_link claim is required.',
  );
  const resourceLinkId = requireStringClaim(
    resourceLink.id,
    'Launch resource_link.id is required.',
  );
  const context = requireRecordClaim(
    payload[CLAIM_CONTEXT],
    'Launch context claim is required for the governed runtime.',
  );
  const contextId = requireStringClaim(
    context.id,
    'Launch context.id is required for the governed runtime.',
  );
  const resolvedLaunch = await resolveLaunchTarget({
    repository: input.repository,
    deployment,
    resourceLinkId,
    contextId,
    customClaim: payload[CLAIM_CUSTOM],
    now,
  });
  const consumedState = await input.repository.consumeLoginState({
    state,
    usedAt: now().toISOString(),
  });
  const launchPresentation = optionalRecordClaim(
    payload[CLAIM_LAUNCH_PRESENTATION],
    'Launch launch_presentation claim must be an object when provided.',
  );
  const userId = requireStringClaim(payload.sub, 'Launch subject is required.');

  return {
    lms: 'canvas',
    internalDeploymentId: deployment.id,
    internalDeploymentSlug: deployment.slug,
    appId: resolvedLaunch.packageVersion.appId,
    packageVersionId: resolvedLaunch.packageVersion.id,
    packageVersion: resolvedLaunch.packageVersion.version,
    contentPath: resolvedLaunch.contentPath,
    attemptId: `attempt-${nextOpaqueToken()}`,
    userId,
    userRole: resolveUserRole(payload[CLAIM_ROLES]),
    resourceLinkId,
    resourceLinkTitle: optionalStringClaim(resourceLink.title),
    contextId,
    contextTitle: optionalStringClaim(context.title),
    targetLinkUri,
    returnUrl: optionalStringClaim(launchPresentation?.return_url),
    activityId: resolvedLaunch.activityId,
    services: parseLaunchServiceClaims(payload),
    issuedAt: now().toISOString(),
    canvasEnvironment: consumedState.canvasEnvironment,
    issuer: consumedState.issuer,
    clientId: consumedState.clientId,
    deploymentId: consumedState.deploymentId,
  };
}

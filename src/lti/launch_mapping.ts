import type {
  LtiAuthorizedLaunch,
  LTISession,
  LtiVerifiedLaunch,
  LtiVerifiedLaunchAuthorizationResult,
  ResolvedLtiDeepLinkingLaunchMessage,
  ResolvedLtiResourceLinkLaunchMessage,
} from '@longsightgroup/lti-tool';
import { resolveLaunchTarget } from './launch_target_resolution.ts';
import { resolveUserRole } from './claim_support.ts';
import { createOpaqueToken } from './token_support.ts';
import type {
  DeepLinkingAcceptType,
  DeepLinkingPresentationDocumentTarget,
  LaunchServiceClaims,
  LmsType,
  ValidatedDeepLinkingRequest,
  ValidatedLaunch,
} from './types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { DeploymentRecord } from '../package_review/types.ts';

export interface LanternLaunchAuthorization {
  readonly deployment: DeploymentRecord;
}

export async function authorizeLanternLaunch(
  repository: PackageReviewRepository,
  launch: LtiVerifiedLaunch,
): Promise<LtiVerifiedLaunchAuthorizationResult<LanternLaunchAuthorization>> {
  const deployment = await repository.getDeploymentByPlatformIdentity({
    issuer: launch.issuer,
    clientId: launch.clientId,
    deploymentId: launch.deploymentId,
  });

  if (deployment === null || deployment.binding === null) {
    return {
      success: false,
      code: 'lantern_deployment_missing',
      message:
        `Lantern has no governed deployment for ${launch.issuer} / ${launch.clientId} / ${launch.deploymentId}.`,
    };
  }

  return {
    success: true,
    data: {
      deployment,
    },
  };
}

export async function mapResourceLinkLaunch(input: {
  repository: PackageReviewRepository;
  verifiedLaunch: LtiAuthorizedLaunch<LanternLaunchAuthorization>;
  session: LTISession;
  message: ResolvedLtiResourceLinkLaunchMessage;
}): Promise<ValidatedLaunch> {
  const deployment = input.verifiedLaunch.authorization.deployment;
  const binding = deployment.binding;

  if (binding === null) {
    throw new Error(`Deployment ${deployment.slug} does not have an LMS binding.`);
  }

  const contextId = requireString(input.message.context?.id, 'Launch context.id is required.');
  const resolved = await resolveLaunchTarget({
    repository: input.repository,
    deployment,
    resourceLinkId: input.message.resourceLink.id,
    contextId,
    customClaim: input.message.customParameters,
    now: () => new Date(),
  });

  return {
    lms: binding.lms,
    canvasEnvironment: binding.lms === 'canvas' ? binding.canvasEnvironment : null,
    issuer: input.verifiedLaunch.issuer,
    clientId: input.verifiedLaunch.clientId,
    deploymentId: input.verifiedLaunch.deploymentId,
    internalDeploymentId: deployment.id,
    internalDeploymentSlug: deployment.slug,
    appId: resolved.packageVersion.appId,
    packageVersionId: resolved.packageVersion.id,
    packageVersion: resolved.packageVersion.version,
    contentPath: resolved.contentPath,
    attemptId: createOpaqueToken(),
    userId: requireString(input.session.user.id, 'Launch user.id is required.'),
    userDisplayName: input.session.user.name ?? null,
    userEmail: input.session.user.email ?? null,
    userLogin: readVerifiedUserLogin(input.session.jwtPayload),
    userRole: resolveUserRole(input.message.roles),
    resourceLinkId: input.message.resourceLink.id,
    resourceLinkTitle: input.message.resourceLink.title ?? null,
    contextId,
    contextTitle: input.message.context?.title ?? null,
    targetLinkUri: input.verifiedLaunch.targetLinkUri,
    returnUrl: readLaunchPresentationReturnUrl(input.session.jwtPayload),
    activityId: resolved.activityId,
    services: mapLaunchServiceClaims(input.session),
    issuedAt: issuedAtIso(input.session),
  };
}

export function mapDeepLinkingLaunch(input: {
  verifiedLaunch: LtiAuthorizedLaunch<LanternLaunchAuthorization>;
  session: LTISession;
  message: ResolvedLtiDeepLinkingLaunchMessage;
}): ValidatedDeepLinkingRequest {
  const deployment = input.verifiedLaunch.authorization.deployment;
  const binding = deployment.binding;

  if (binding === null) {
    throw new Error(`Deployment ${deployment.slug} does not have an LMS binding.`);
  }

  return {
    ltiToolSessionId: input.session.id,
    lms: binding.lms as LmsType,
    canvasEnvironment: binding.lms === 'canvas' ? binding.canvasEnvironment : null,
    issuer: input.verifiedLaunch.issuer,
    clientId: input.verifiedLaunch.clientId,
    deploymentId: input.verifiedLaunch.deploymentId,
    internalDeploymentId: deployment.id,
    internalDeploymentSlug: deployment.slug,
    appId: deployment.appId,
    userId: input.session.user.id ?? null,
    userRole: resolveUserRole(input.message.roles),
    contextId: input.message.context?.id ?? null,
    contextTitle: input.message.context?.title ?? null,
    targetLinkUri: input.verifiedLaunch.targetLinkUri,
    deepLinkReturnUrl: input.message.deepLinkingSettings.returnUrl,
    data: input.message.deepLinkingSettings.data ?? null,
    placement: resolveDeepLinkingPlacement(input.verifiedLaunch.targetLinkUri),
    settings: {
      acceptTypes: input.message.deepLinkingSettings.acceptTypes
        .filter((value): value is DeepLinkingAcceptType => value === 'ltiResourceLink'),
      acceptMultiple: input.message.deepLinkingSettings.acceptMultiple,
      acceptPresentationDocumentTargets: input.message.deepLinkingSettings
        .acceptPresentationDocumentTargets.filter((
          value,
        ): value is DeepLinkingPresentationDocumentTarget =>
          value === 'iframe' || value === 'window' || value === 'embed'
        ),
      acceptLineItem: input.message.deepLinkingSettings.acceptLineItem ?? false,
    },
    issuedAt: issuedAtIso(input.session),
  };
}

export function mapLaunchServiceClaims(session: LTISession): LaunchServiceClaims {
  return {
    ags: session.services?.ags === undefined ? null : {
      scope: [...session.services.ags.scopes],
      lineitemsUrl: session.services.ags.lineitems ?? null,
      lineitemUrl: session.services.ags.lineitem ?? null,
    },
    nrps: session.services?.nrps === undefined ? null : {
      contextMembershipsUrl: session.services.nrps.membershipUrl,
      serviceVersions: [...session.services.nrps.versions],
    },
  };
}

function resolveDeepLinkingPlacement(
  targetLinkUri: string,
): ValidatedDeepLinkingRequest['placement'] {
  const url = new URL(targetLinkUri);
  const placement = url.searchParams.get('placement');

  if (placement === 'resource_selection') {
    return 'resource_selection';
  }

  return 'assignment_selection';
}

function issuedAtIso(session: LTISession): string {
  return typeof session.jwtPayload.iat === 'number'
    ? new Date(session.jwtPayload.iat * 1000).toISOString()
    : new Date().toISOString();
}

function readLaunchPresentationReturnUrl(payload: LTISession['jwtPayload']): string | null {
  const claim = payload['https://purl.imsglobal.org/spec/lti/claim/launch_presentation'];

  if (typeof claim !== 'object' || claim === null || Array.isArray(claim)) {
    return null;
  }

  return readOptionalString((claim as Record<string, unknown>).return_url);
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readVerifiedUserLogin(_payload: LTISession['jwtPayload']): string | null {
  // lti-tool verifies launches through a schema that does not expose Canvas preferred_username.
  return null;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(message);
  }

  return value;
}

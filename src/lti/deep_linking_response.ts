import { SignJWT } from "jose";
import { buildCanvasLaunchUrl } from "./config.ts";
import { loadToolSigningKey } from "./tool_key.ts";
import {
  buildLtiActivityResourceId,
  type DeepLinkingPresentationDocumentTarget,
  type DeepLinkingResponseContentItem,
  type DeepLinkingResponseLineItem,
  type DeepLinkingResponseSubmission,
  type DeepLinkingSessionRecord,
  LANTERN_PLACEMENT_CUSTOM_KEY,
  LTI_DEEP_LINKING_RESPONSE_MESSAGE_TYPE,
} from "./types.ts";
import type {
  DeploymentRecord,
  PackageVersionRecord,
  ReviewedPlacementRecord,
} from "../package_review/types.ts";

const CLAIM_MESSAGE_TYPE =
  "https://purl.imsglobal.org/spec/lti/claim/message_type";
const CLAIM_VERSION = "https://purl.imsglobal.org/spec/lti/claim/version";
const CLAIM_DEPLOYMENT_ID =
  "https://purl.imsglobal.org/spec/lti/claim/deployment_id";
const CLAIM_DATA = "https://purl.imsglobal.org/spec/lti-dl/claim/data";
const CLAIM_CONTENT_ITEMS =
  "https://purl.imsglobal.org/spec/lti-dl/claim/content_items";
const FINAL_GRADE_TAG = "final-grade";
const RESPONSE_JWT_TTL_SECONDS = 5 * 60;

interface EnvReader {
  get(name: string): string | undefined;
}

export async function buildDeepLinkingResponseSubmission(input: {
  session: DeepLinkingSessionRecord;
  deployment: DeploymentRecord;
  placement: ReviewedPlacementRecord;
  packageVersion: PackageVersionRecord;
  appOrigin?: string;
  now?: () => Date;
  env?: EnvReader;
}): Promise<DeepLinkingResponseSubmission> {
  const now = input.now ?? (() => new Date());
  const binding = input.deployment.binding;

  if (binding === null) {
    throw new Error(
      `Deployment ${input.deployment.slug} is missing its LTI binding.`,
    );
  }

  const toolKey = await loadToolSigningKey(input.env ?? Deno.env);
  const issuedAt = Math.floor(now().getTime() / 1000);
  const contentItems = [buildDeepLinkingResponseContentItem(input)];
  const jwtId = crypto.randomUUID();
  const claims = {
    nonce: jwtId,
    [CLAIM_DEPLOYMENT_ID]: binding.deploymentId,
    [CLAIM_MESSAGE_TYPE]: LTI_DEEP_LINKING_RESPONSE_MESSAGE_TYPE,
    [CLAIM_VERSION]: "1.3.0",
    [CLAIM_CONTENT_ITEMS]: contentItems,
    ...(input.session.data === null
      ? {}
      : { [CLAIM_DATA]: input.session.data }),
  };
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({
      alg: toolKey.privateJwk.alg,
      kid: toolKey.publicJwk.kid,
      typ: "JWT",
    })
    .setIssuer(binding.clientId)
    .setSubject(binding.clientId)
    .setAudience(binding.issuer)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + RESPONSE_JWT_TTL_SECONDS)
    .setJti(jwtId)
    .sign(toolKey.privateKey);

  return {
    returnUrl: input.session.deepLinkReturnUrl,
    jwt,
    formFields: {
      JWT: jwt,
    },
  };
}

export function buildReviewedPlacementLineItemResourceId(
  placement: ReviewedPlacementRecord,
): string {
  return buildLtiActivityResourceId({
    appId: placement.appId,
    packageVersion: placement.packageVersion,
    activityId: placement.activityId,
  });
}

function buildDeepLinkingResponseContentItem(input: {
  session: DeepLinkingSessionRecord;
  placement: ReviewedPlacementRecord;
  packageVersion: PackageVersionRecord;
  appOrigin?: string;
}): DeepLinkingResponseContentItem {
  const title = input.placement.contentTitle ??
    `${input.placement.packageTitle} ${input.placement.packageVersion}`;
  const lineItem = input.session.acceptLineItem &&
      input.session.placement === "assignment_selection"
    ? buildOptionalLineItem({
      placement: input.placement,
      packageVersion: input.packageVersion,
      title,
    })
    : null;
  const presentationDocumentTarget = resolvePresentationDocumentTarget(
    input.session.acceptPresentationDocumentTargets,
  );

  return {
    type: "ltiResourceLink",
    title,
    text: "Launches one reviewed Lantern activity through the governed broker.",
    url: buildCanvasLaunchUrl(input.appOrigin),
    custom: {
      [LANTERN_PLACEMENT_CUSTOM_KEY]: input.placement.placementId,
    },
    ...(presentationDocumentTarget === null ? {} : {
      presentation: {
        documentTarget: presentationDocumentTarget,
      },
    }),
    ...(lineItem === null ? {} : { lineItem }),
  };
}

function buildOptionalLineItem(input: {
  placement: ReviewedPlacementRecord;
  packageVersion: PackageVersionRecord;
  title: string;
}): DeepLinkingResponseLineItem | null {
  if (input.packageVersion.grading.maxScore === null) {
    return null;
  }

  return {
    scoreMaximum: input.packageVersion.grading.maxScore,
    label: input.title,
    resourceId: buildReviewedPlacementLineItemResourceId(input.placement),
    tag: FINAL_GRADE_TAG,
  };
}

function resolvePresentationDocumentTarget(
  targets: DeepLinkingSessionRecord["acceptPresentationDocumentTargets"],
): DeepLinkingPresentationDocumentTarget | null {
  if (targets.length === 0) {
    return null;
  }

  return targets.includes("iframe") ? "iframe" : targets[0] ?? null;
}

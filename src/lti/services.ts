import * as oauth from "oauth4webapi";
import { resolveCanvasPlatform } from "./canvas_platform.ts";
import { resolveServiceTokenEndpoint } from "./platform_binding.ts";
import {
  mapMembership,
  parseLineItemCollection,
  parseNextLink,
  readJsonResponse,
  readMaybeJson,
  requireRecord,
  requireTrimmedString,
  resolveCanvasTokenEndpoint,
  toLineItemsUrl,
  toScoresUrl,
  uniqueTrimmedStrings,
} from "./service_support.ts";
import { loadToolSigningKey } from "./tool_key.ts";
import type { DeploymentBinding } from "./types.ts";
import type { GradePublicationRecord } from "../package_review/types.ts";

const LINE_ITEM_CONTENT_TYPE = "application/vnd.ims.lis.v2.lineitem+json";
const LINE_ITEM_CONTAINER_CONTENT_TYPE =
  "application/vnd.ims.lis.v2.lineitemcontainer+json";
const SCORE_CONTENT_TYPE = "application/vnd.ims.lis.v1.score+json";
const NRPS_CONTENT_TYPE =
  "application/vnd.ims.lti-nrps.v2.membershipcontainer+json";

export interface ServiceAccessToken {
  accessToken: string;
  expiresIn: number | null;
  scope: string[];
}

export interface EnsureLineItemInput {
  accessToken: string;
  lineitemsUrl: string | null;
  lineitemUrl?: string | null;
  resourceLinkId: string;
  resourceId: string;
  tag: string;
  label: string;
  scoreMaximum: number;
}

export interface EnsureLineItemResult {
  lineItemsUrl: string;
  lineItemUrl: string;
  resourceId: string;
  tag: string;
  label: string;
  scoreMaximum: number;
  created: boolean;
}

export interface PublishFinalScoreInput {
  accessToken: string;
  lineItemUrl: string;
  canvasUserId: string;
  scoreGiven: number;
  scoreMaximum: number;
  activityProgress: GradePublicationRecord["activityProgress"];
  gradingProgress: GradePublicationRecord["gradingProgress"];
  timestamp?: string;
}

export type PublishFinalScoreResult = { accepted: boolean; status: number };

export interface NrpsMembership {
  userId: string | null;
  roles: string[];
  status: string | null;
  name: string | null;
  email: string | null;
}

async function performServiceAccessTokenRequest(input: {
  issuer: string;
  clientId: string;
  tokenEndpoint: string;
  scopes: string[];
  deploymentId?: string;
}): Promise<ServiceAccessToken> {
  const clientId = requireTrimmedString(
    input.clientId,
    "LTI client ID is required for service auth.",
  );
  const scopes = uniqueTrimmedStrings(
    input.scopes,
    "At least one LTI service scope is required.",
  );
  const signingKey = await loadToolSigningKey();
  const as: oauth.AuthorizationServer = {
    issuer: input.issuer,
    token_endpoint: input.tokenEndpoint,
  };
  const client: oauth.Client = {
    client_id: clientId,
  };
  const parameters = new URLSearchParams({
    scope: scopes.join(" "),
  });

  if (input.deploymentId !== undefined) {
    parameters.set("deployment_id", input.deploymentId);
  }

  const response = await oauth.clientCredentialsGrantRequest(
    as,
    client,
    oauth.PrivateKeyJwt(signingKey.privateKey, {
      [oauth.modifyAssertion]: (header) => {
        header.kid = signingKey.publicJwk.kid;
      },
    }),
    parameters,
  );
  const token = await oauth.processClientCredentialsResponse(
    as,
    client,
    response,
  );

  if (token.token_type !== "bearer") {
    throw new Error(
      `LTI service token endpoint returned unsupported token type ${token.token_type}.`,
    );
  }

  return {
    accessToken: token.access_token,
    expiresIn: token.expires_in ?? null,
    scope: token.scope ? token.scope.split(" ").filter(Boolean) : scopes,
  };
}

export async function requestServiceAccessToken(input: {
  binding: DeploymentBinding;
  scopes: string[];
}): Promise<ServiceAccessToken> {
  return await performServiceAccessTokenRequest({
    issuer: input.binding.issuer,
    clientId: input.binding.clientId,
    tokenEndpoint: resolveServiceTokenEndpoint(input.binding),
    scopes: input.scopes,
    ...(input.binding.deploymentId === undefined
      ? {}
      : { deploymentId: input.binding.deploymentId }),
  });
}

export async function requestCanvasServiceAccessToken(input: {
  issuer: string;
  clientId: string;
  scopes: string[];
  deploymentId?: string;
}): Promise<ServiceAccessToken> {
  const platform = resolveCanvasPlatform(input.issuer);

  return await performServiceAccessTokenRequest({
    issuer: platform.issuer,
    clientId: input.clientId,
    tokenEndpoint: resolveCanvasTokenEndpoint(platform.authorizationEndpoint),
    scopes: input.scopes,
    ...(input.deploymentId === undefined
      ? {}
      : { deploymentId: input.deploymentId }),
  });
}

export async function ensureLineItem(
  input: EnsureLineItemInput,
): Promise<EnsureLineItemResult> {
  if (input.lineitemUrl) {
    return {
      lineItemsUrl: input.lineitemsUrl ?? toLineItemsUrl(input.lineitemUrl),
      lineItemUrl: requireTrimmedString(
        input.lineitemUrl,
        "Canvas AGS lineitem URL is required.",
      ),
      resourceId: input.resourceId,
      tag: input.tag,
      label: input.label,
      scoreMaximum: input.scoreMaximum,
      created: false,
    };
  }

  const lineItemsUrl = requireTrimmedString(
    input.lineitemsUrl,
    "Canvas AGS lineitems URL is required.",
  );
  const listResponse = await fetch(lineItemsUrl, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept:
        `${LINE_ITEM_CONTAINER_CONTENT_TYPE}, ${LINE_ITEM_CONTENT_TYPE}, application/json`,
    },
  });
  const listedItems = await readJsonResponse(
    listResponse,
    "Canvas line item lookup failed.",
  );
  const existing = parseLineItemCollection(listedItems).find(
    (candidate) =>
      candidate.resourceLinkId === input.resourceLinkId &&
      candidate.resourceId === input.resourceId &&
      candidate.tag === input.tag,
  );

  if (existing) {
    return {
      lineItemsUrl,
      lineItemUrl: existing.lineItemUrl,
      resourceId: existing.resourceId,
      tag: existing.tag,
      label: existing.label,
      scoreMaximum: existing.scoreMaximum,
      created: false,
    };
  }

  const createResponse = await fetch(lineItemsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: `${LINE_ITEM_CONTENT_TYPE}, application/json`,
      "content-type": LINE_ITEM_CONTENT_TYPE,
    },
    body: JSON.stringify({
      scoreMaximum: input.scoreMaximum,
      label: input.label,
      resourceId: input.resourceId,
      resourceLinkId: input.resourceLinkId,
      tag: input.tag,
    }),
  });

  if (!createResponse.ok) {
    throw new Error(
      `Canvas line item create failed with status ${createResponse.status}.`,
    );
  }

  const created = await readMaybeJson(createResponse);
  const lineItemUrl = created && typeof created.id === "string"
    ? created.id
    : requireTrimmedString(
      createResponse.headers.get("location"),
      "Canvas line item create response did not include an id or location.",
    );

  return {
    lineItemsUrl,
    lineItemUrl,
    resourceId: input.resourceId,
    tag: input.tag,
    label: created && typeof created.label === "string"
      ? created.label
      : input.label,
    scoreMaximum: created && typeof created.scoreMaximum === "number"
      ? created.scoreMaximum
      : input.scoreMaximum,
    created: true,
  };
}

export async function publishFinalScore(
  input: PublishFinalScoreInput,
): Promise<PublishFinalScoreResult> {
  const response = await fetch(toScoresUrl(input.lineItemUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
      "content-type": SCORE_CONTENT_TYPE,
    },
    body: JSON.stringify({
      userId: input.canvasUserId,
      scoreGiven: input.scoreGiven,
      scoreMaximum: input.scoreMaximum,
      activityProgress: input.activityProgress,
      gradingProgress: input.gradingProgress,
      timestamp: input.timestamp ?? new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Canvas score publish failed with status ${response.status}.`,
    );
  }

  return {
    accepted: true,
    status: response.status,
  };
}

export async function readContextMemberships(input: {
  accessToken: string;
  contextMembershipsUrl: string;
}): Promise<NrpsMembership[]> {
  const memberships: NrpsMembership[] = [];
  let nextUrl: string | null = requireTrimmedString(
    input.contextMembershipsUrl,
    "Canvas NRPS memberships URL is required.",
  );

  while (nextUrl !== null) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: `${NRPS_CONTENT_TYPE}, application/json`,
      },
    });
    const payload = await readJsonResponse(
      response,
      "Canvas NRPS memberships read failed.",
    );
    const container = requireRecord(
      payload,
      "Canvas NRPS memberships response must be an object.",
    );
    const members = container.members;

    if (!Array.isArray(members)) {
      throw new TypeError(
        "Canvas NRPS memberships response must include members.",
      );
    }

    memberships.push(
      ...members.map((member, index) => mapMembership(member, index)),
    );
    nextUrl = parseNextLink(response.headers.get("link"));
  }

  return memberships;
}

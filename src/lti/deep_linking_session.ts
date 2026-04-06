import type {
  DeepLinkingResourceOption,
  DeepLinkingResourceSelection,
  ReviewedPlacementRecord,
} from '../package_review/types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import { createOpaqueToken } from './token_support.ts';
import {
  normalizeDeepLinkingSelectionInput,
  resolveDeepLinkingSelection,
} from './deep_linking_selection.ts';
import type { DeepLinkingSessionRecord, ValidatedDeepLinkingRequest } from './types.ts';
import { requireTrimmedValue } from './claim_support.ts';

const DEEP_LINKING_SESSION_TTL_MS = 10 * 60 * 1000;

export async function createDeepLinkingSession(input: {
  repository: PackageReviewRepository;
  request: ValidatedDeepLinkingRequest;
  now?: () => Date;
  createOpaqueToken?: () => string;
}): Promise<DeepLinkingSessionRecord> {
  const now = input.now ?? (() => new Date());
  const nextOpaqueToken = input.createOpaqueToken ?? createOpaqueToken;
  const createdAt = now();

  return await input.repository.createDeepLinkingSession({
    sessionId: nextOpaqueToken(),
    sessionToken: nextOpaqueToken(),
    deploymentRecordId: input.request.internalDeploymentId,
    deploymentSlug: input.request.internalDeploymentSlug,
    appId: input.request.appId,
    userId: input.request.userId,
    userRole: input.request.userRole,
    contextId: input.request.contextId,
    contextTitle: input.request.contextTitle,
    deepLinkReturnUrl: input.request.deepLinkReturnUrl,
    data: input.request.data,
    placement: input.request.placement,
    acceptTypes: [...input.request.settings.acceptTypes],
    acceptMultiple: input.request.settings.acceptMultiple,
    acceptPresentationDocumentTargets: [
      ...input.request.settings.acceptPresentationDocumentTargets,
    ],
    acceptLineItem: input.request.settings.acceptLineItem,
    selection: null,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + DEEP_LINKING_SESSION_TTL_MS).toISOString(),
    usedAt: null,
  });
}

export async function requireAuthorizedDeepLinkingSession(input: {
  repository: PackageReviewRepository;
  sessionId: string;
  token: string;
  now?: () => Date;
}): Promise<DeepLinkingSessionRecord> {
  const sessionId = requireTrimmedValue(input.sessionId, 'Deep Linking session id is required.');
  const token = requireTrimmedValue(input.token, 'Deep Linking session token is required.');
  const session = await input.repository.getDeepLinkingSessionById(sessionId);

  if (!session) {
    throw new Error(`Deep Linking session ${sessionId} was not found.`);
  }

  authorizeDeepLinkingSession({
    token,
    expected: session,
    ...(input.now === undefined ? {} : { now: input.now }),
  });

  return session;
}

export function authorizeDeepLinkingSession(input: {
  token: string;
  expected: DeepLinkingSessionRecord;
  now?: () => Date;
}): void {
  const now = input.now ?? (() => new Date());
  const token = requireTrimmedValue(input.token, 'Deep Linking session token is required.');

  if (Date.parse(input.expected.expiresAt) <= now().getTime()) {
    throw new Error(`Deep Linking session ${input.expected.sessionId} has expired.`);
  }

  if (input.expected.usedAt !== null) {
    throw new Error(`Deep Linking session ${input.expected.sessionId} has already been used.`);
  }

  if (token !== input.expected.sessionToken) {
    throw new Error(`Deep Linking session token did not match ${input.expected.sessionId}.`);
  }
}

export async function listDeepLinkingResources(input: {
  repository: PackageReviewRepository;
  session: DeepLinkingSessionRecord;
}): Promise<DeepLinkingResourceOption[]> {
  return await input.repository.listDeepLinkingResourceOptions(
    input.session.appId,
    input.session.placement,
  );
}

export async function saveDeepLinkingSessionSelection(input: {
  repository: PackageReviewRepository;
  session: DeepLinkingSessionRecord;
  selectionValue: string;
}): Promise<{
  session: DeepLinkingSessionRecord;
  selection: DeepLinkingResourceSelection;
}> {
  const resources = await listDeepLinkingResources({
    repository: input.repository,
    session: input.session,
  });
  const selection = normalizeDeepLinkingSelectionInput({
    selectionValue: input.selectionValue,
    resources,
  });
  const session = await input.repository.updateDeepLinkingSessionSelection({
    sessionId: input.session.sessionId,
    selection: {
      packageVersionId: selection.packageVersionId,
      packageVersion: selection.packageVersion,
      activityId: selection.activityId,
      contentPath: selection.contentPath,
    },
  });

  return {
    session,
    selection,
  };
}

export async function createReviewedPlacementFromDeepLinkingSession(input: {
  repository: PackageReviewRepository;
  session: DeepLinkingSessionRecord;
  now?: () => Date;
  createPlacementId?: () => string;
}): Promise<{
  placement: ReviewedPlacementRecord;
  selection: DeepLinkingResourceSelection;
}> {
  const now = input.now ?? (() => new Date());
  const createPlacementId = input.createPlacementId ?? createOpaqueToken;
  const resources = await listDeepLinkingResources({
    repository: input.repository,
    session: input.session,
  });
  const selection = resolveDeepLinkingSelection({
    session: input.session,
    resources,
  });

  if (selection === null) {
    throw new Error(
      `Deep Linking session ${input.session.sessionId} does not have a valid reviewed selection.`,
    );
  }

  return {
    placement: await input.repository.createReviewedPlacement({
      placementId: createPlacementId(),
      deploymentRecordId: input.session.deploymentRecordId,
      deploymentSlug: input.session.deploymentSlug,
      appId: input.session.appId,
      contextId: input.session.contextId,
      contextTitle: input.session.contextTitle,
      packageVersionId: selection.packageVersionId,
      packageVersion: selection.packageVersion,
      packageTitle: selection.packageTitle,
      activityId: selection.activityId,
      contentPath: selection.contentPath,
      contentTitle: selection.contentTitle,
      createdByUserId: input.session.userId,
      resourceLinkId: null,
      createdAt: now().toISOString(),
      boundAt: null,
    }),
    selection,
  };
}

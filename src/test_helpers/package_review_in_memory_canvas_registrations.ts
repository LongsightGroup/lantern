import type { DeploymentRecord } from '../package_review/types.ts';
import { DEFAULT_UPDATED_AT } from './package_review_test_defaults.ts';
import type { InMemoryRepositoryState } from './package_review_in_memory_shared.ts';
import { cloneRecord, nextId } from './package_review_in_memory_shared.ts';
import { buildDeploymentRecord } from './package_review_test_builder_base.ts';

type PendingCanvasDeployment = DeploymentRecord & {
  pendingCanvasIssuer?: string;
  pendingCanvasClientId?: string;
  pendingCanvasEnvironment?: 'production' | 'beta' | 'test';
};

export function completePendingCanvasBinding(
  state: InMemoryRepositoryState,
  input: {
    issuer: string;
    clientId: string;
    deploymentId: string;
  },
): DeploymentRecord | null {
  const exactMatch = state.deployments.find(
    (candidate) =>
      candidate.lmsType === 'canvas' &&
      candidate.binding?.lms === 'canvas' &&
      candidate.binding.issuer === input.issuer &&
      candidate.binding.clientId === input.clientId &&
      candidate.binding.deploymentId === input.deploymentId,
  );

  if (exactMatch) {
    return cloneRecord(exactMatch);
  }

  const pending = state.deployments.filter((candidate) =>
    isMatchingPendingCanvasDeployment(candidate, input)
  );

  if (pending.length === 0) {
    return null;
  }

  if (pending.length > 1) {
    throw new Error(
      `Multiple Canvas registrations matched issuer ${input.issuer} with client ${input.clientId}. Resolve the duplicate Canvas registrations before login can continue.`,
    );
  }

  const deployment = pending[0];

  if (!deployment) {
    return null;
  }

  const pendingCanvas = deployment as PendingCanvasDeployment;
  const nextDeployment = buildDeploymentRecord({
    ...deployment,
    binding: {
      lms: 'canvas',
      issuer: input.issuer,
      clientId: input.clientId,
      deploymentId: input.deploymentId,
      canvasEnvironment: pendingCanvas.pendingCanvasEnvironment ?? 'production',
    },
    updatedAt: DEFAULT_UPDATED_AT,
  });
  const index = state.deployments.findIndex((candidate) => candidate.slug === deployment.slug);
  state.deployments.splice(index, 1, nextDeployment);

  return cloneRecord(nextDeployment);
}

export function saveCanvasRegistration(
  state: InMemoryRepositoryState,
  input: {
    slug: string;
    label: string;
    appId: string;
    canvasEnvironment: 'production' | 'beta' | 'test';
    issuer: string;
    clientId: string;
  },
): DeploymentRecord {
  const existing = state.deployments.find((candidate) => candidate.slug === input.slug);
  const existingAppSlot = state.deployments.find(
    (candidate) =>
      candidate.slug !== input.slug &&
      candidate.appId === input.appId &&
      candidate.lmsType === 'canvas',
  );
  const conflicting = state.deployments.find((candidate) => {
    const pendingCanvas = candidate as PendingCanvasDeployment;

    return (
      candidate.slug !== input.slug &&
      candidate.lmsType === 'canvas' &&
      candidate.binding === null &&
      pendingCanvas.pendingCanvasIssuer === input.issuer &&
      pendingCanvas.pendingCanvasClientId === input.clientId
    );
  });

  if (conflicting) {
    throw new Error(
      `Canvas registration ${input.clientId} is already reserved for another deployment.`,
    );
  }

  if (existing && existing.appId !== input.appId) {
    throw new Error(`Deployment ${input.slug} belongs to app ${existing.appId}.`);
  }

  if (existing && existing.lmsType !== 'canvas') {
    throw new Error(
      `Deployment ${input.slug} is already bound as ${existing.lmsType} and cannot change to canvas.`,
    );
  }

  if (existingAppSlot) {
    throw new Error(`App ${input.appId} already has a canvas deployment.`);
  }

  const nextDeployment = {
    ...buildDeploymentRecord({
      id: existing?.id ?? nextId(state.deployments),
      slug: input.slug,
      label: input.label,
      appId: input.appId,
      enabledPackageVersionId: existing?.enabledPackageVersionId ?? null,
      enabledPackageVersion: existing?.enabledPackageVersion ?? null,
      lmsType: 'canvas',
      binding: null,
      ltiProfileOverride: existing?.ltiProfileOverride ?? null,
      updatedAt: DEFAULT_UPDATED_AT,
    }),
    pendingCanvasIssuer: input.issuer,
    pendingCanvasClientId: input.clientId,
    pendingCanvasEnvironment: input.canvasEnvironment,
  };

  if (existing) {
    const index = state.deployments.findIndex((candidate) => candidate.slug === input.slug);
    state.deployments.splice(index, 1, nextDeployment);
  } else {
    state.deployments.push(nextDeployment);
  }

  return cloneRecord(nextDeployment);
}

function isMatchingPendingCanvasDeployment(
  candidate: DeploymentRecord,
  input: {
    issuer: string;
    clientId: string;
  },
): boolean {
  const pendingCanvas = candidate as PendingCanvasDeployment;

  return (
    candidate.lmsType === 'canvas' &&
    candidate.binding === null &&
    candidate.slug !== '' &&
    candidate.appId !== '' &&
    pendingCanvas.pendingCanvasIssuer === input.issuer &&
    pendingCanvas.pendingCanvasClientId === input.clientId
  );
}

import type { PackageReviewRepository } from '../package_review/repository.ts';
import { DEFAULT_UPDATED_AT } from './package_review_test_defaults.ts';
import type { InMemoryRepositoryState } from './package_review_in_memory_shared.ts';
import { cloneRecord, nextId } from './package_review_in_memory_shared.ts';
import { buildDeploymentRecord } from './package_review_test_builder_base.ts';

type DeploymentRepository = Pick<
  PackageReviewRepository,
  | 'getDeploymentBySlug'
  | 'getDeploymentByBinding'
  | 'saveDeploymentBinding'
  | 'pinDeploymentVersion'
>;

export function createInMemoryDeploymentRepository(
  state: InMemoryRepositoryState,
): DeploymentRepository {
  return {
    getDeploymentBySlug(slug) {
      const deployment = state.deployments.find((candidate) => candidate.slug === slug);
      return Promise.resolve(deployment ? cloneRecord(deployment) : null);
    },

    getDeploymentByBinding(binding) {
      const deployment = state.deployments.find(
        (candidate) =>
          candidate.binding?.issuer === binding.issuer &&
          candidate.binding?.clientId === binding.clientId &&
          candidate.binding?.deploymentId === binding.deploymentId,
      );
      return Promise.resolve(deployment ? cloneRecord(deployment) : null);
    },

    saveDeploymentBinding(input) {
      const existing = state.deployments.find((candidate) => candidate.slug === input.slug);
      const conflicting = state.deployments.find(
        (candidate) =>
          candidate.slug !== input.slug &&
          candidate.binding?.issuer === input.binding.issuer &&
          candidate.binding?.clientId === input.binding.clientId &&
          candidate.binding?.deploymentId === input.binding.deploymentId,
      );

      if (conflicting) {
        throw new Error(
          `Canvas binding ${input.binding.clientId} / ${input.binding.deploymentId} already belongs to another deployment.`,
        );
      }

      if (existing && existing.appId !== input.appId) {
        throw new Error(`Deployment ${input.slug} belongs to app ${existing.appId}.`);
      }

      const nextDeployment = buildDeploymentRecord({
        id: existing?.id ?? nextId(state.deployments),
        slug: input.slug,
        label: input.label,
        appId: input.appId,
        enabledPackageVersionId: existing?.enabledPackageVersionId ?? null,
        enabledPackageVersion: existing?.enabledPackageVersion ?? null,
        binding: cloneRecord(input.binding),
        updatedAt: DEFAULT_UPDATED_AT,
      });

      if (existing) {
        const index = state.deployments.findIndex((candidate) => candidate.slug === input.slug);
        state.deployments.splice(index, 1, nextDeployment);
      } else {
        state.deployments.push(nextDeployment);
      }

      return Promise.resolve(cloneRecord(nextDeployment));
    },

    pinDeploymentVersion(input) {
      const packageVersion = state.packageVersions.find(
        (candidate) => candidate.id === input.packageVersionId,
      );

      if (!packageVersion) {
        throw new Error(`Package version id ${input.packageVersionId} was not found.`);
      }

      if (packageVersion.approvalStatus !== 'approved') {
        throw new Error('Only approved package versions can be enabled.');
      }

      if (packageVersion.appId !== input.appId) {
        throw new Error(
          `Package version ${packageVersion.appId}@${packageVersion.version} does not belong to deployment app ${input.appId}.`,
        );
      }

      const existing = state.deployments.find((candidate) => candidate.slug === input.slug);

      if (existing && existing.appId !== input.appId) {
        throw new Error(`Deployment ${input.slug} belongs to app ${existing.appId}.`);
      }

      const nextDeployment = buildDeploymentRecord({
        id: existing?.id ?? nextId(state.deployments),
        slug: input.slug,
        label: input.label,
        appId: input.appId,
        enabledPackageVersionId: packageVersion.id,
        enabledPackageVersion: packageVersion.version,
        binding: existing?.binding ?? null,
        updatedAt: DEFAULT_UPDATED_AT,
      });

      if (existing) {
        const index = state.deployments.findIndex((candidate) => candidate.slug === input.slug);
        state.deployments.splice(index, 1, nextDeployment);
      } else {
        state.deployments.push(nextDeployment);
      }

      return Promise.resolve(cloneRecord(nextDeployment));
    },
  };
}

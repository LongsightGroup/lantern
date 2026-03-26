import type { PackageReviewRepository } from "../package_review/repository.ts";
import { DEFAULT_UPDATED_AT } from "./package_review_test_defaults.ts";
import type { InMemoryRepositoryState } from "./package_review_in_memory_shared.ts";
import { cloneRecord, nextId } from "./package_review_in_memory_shared.ts";
import { buildDeploymentRecord } from "./package_review_test_builder_base.ts";

type DeploymentRepository = Pick<
  PackageReviewRepository,
  | "getDeploymentBySlug"
  | "listDeploymentsByApp"
  | "getDeploymentByBinding"
  | "getDeploymentByPlatformIdentity"
  | "saveDeploymentBinding"
  | "pinDeploymentVersion"
>;

export function createInMemoryDeploymentRepository(
  state: InMemoryRepositoryState,
): DeploymentRepository {
  return {
    getDeploymentBySlug(slug) {
      const deployment = state.deployments.find((candidate) =>
        candidate.slug === slug
      );
      return Promise.resolve(deployment ? cloneRecord(deployment) : null);
    },

    listDeploymentsByApp(appId) {
      return Promise.resolve(
        state.deployments
          .filter((candidate) => candidate.appId === appId)
          .map((deployment) => cloneRecord(deployment)),
      );
    },

    getDeploymentByBinding(binding) {
      const deployment = state.deployments.find(
        (candidate) =>
          candidate.binding?.lms === binding.lms &&
          candidate.binding?.issuer === binding.issuer &&
          candidate.binding?.clientId === binding.clientId &&
          candidate.binding?.deploymentId === binding.deploymentId,
      );
      return Promise.resolve(deployment ? cloneRecord(deployment) : null);
    },

    getDeploymentByPlatformIdentity(input) {
      const deployments = state.deployments.filter(
        (candidate) =>
          candidate.binding?.issuer === input.issuer &&
          candidate.binding?.clientId === input.clientId &&
          candidate.binding?.deploymentId === input.deploymentId,
      );

      if (deployments.length === 0) {
        return Promise.resolve(null);
      }

      if (deployments.length > 1) {
        throw new Error(
          `Multiple deployments matched issuer ${input.issuer} with client ${input.clientId} and deployment ${input.deploymentId}. Resolve the duplicate LMS bindings before login can continue.`,
        );
      }

      const deployment = deployments[0];

      if (!deployment) {
        return Promise.resolve(null);
      }

      return Promise.resolve(cloneRecord(deployment));
    },

    saveDeploymentBinding(input) {
      const existing = state.deployments.find((candidate) =>
        candidate.slug === input.slug
      );
      const existingAppSlot = state.deployments.find(
        (candidate) =>
          candidate.slug !== input.slug &&
          candidate.appId === input.appId &&
          candidate.binding?.lms === input.binding.lms,
      );
      const conflicting = state.deployments.find(
        (candidate) =>
          candidate.slug !== input.slug &&
          candidate.binding?.lms === input.binding.lms &&
          candidate.binding?.issuer === input.binding.issuer &&
          candidate.binding?.clientId === input.binding.clientId &&
          candidate.binding?.deploymentId === input.binding.deploymentId,
      );

      if (conflicting) {
        throw new Error(
          `${
            formatBindingLabel(input.binding.lms)
          } ${input.binding.clientId} / ${input.binding.deploymentId} already belongs to another deployment.`,
        );
      }

      if (existing && existing.appId !== input.appId) {
        throw new Error(
          `Deployment ${input.slug} belongs to app ${existing.appId}.`,
        );
      }

      if (
        existing && existing.binding !== null &&
        existing.binding.lms !== input.binding.lms
      ) {
        throw new Error(
          `Deployment ${input.slug} is already bound as ${existing.binding.lms} and cannot change to ${input.binding.lms}.`,
        );
      }

      if (existingAppSlot) {
        throw new Error(
          `App ${input.appId} already has a ${input.binding.lms} deployment.`,
        );
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
        const index = state.deployments.findIndex((candidate) =>
          candidate.slug === input.slug
        );
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
        throw new Error(
          `Package version id ${input.packageVersionId} was not found.`,
        );
      }

      if (packageVersion.approvalStatus !== "approved") {
        throw new Error("Only approved package versions can be enabled.");
      }

      if (packageVersion.appId !== input.appId) {
        throw new Error(
          `Package version ${packageVersion.appId}@${packageVersion.version} does not belong to deployment app ${input.appId}.`,
        );
      }

      const existing = state.deployments.find((candidate) =>
        candidate.slug === input.slug
      );

      if (existing && existing.appId !== input.appId) {
        throw new Error(
          `Deployment ${input.slug} belongs to app ${existing.appId}.`,
        );
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
        const index = state.deployments.findIndex((candidate) =>
          candidate.slug === input.slug
        );
        state.deployments.splice(index, 1, nextDeployment);
      } else {
        state.deployments.push(nextDeployment);
      }

      return Promise.resolve(cloneRecord(nextDeployment));
    },
  };
}

function formatBindingLabel(lms: "canvas" | "moodle" | "sakai"): string {
  return `${lms.slice(0, 1).toUpperCase()}${lms.slice(1)} binding`;
}

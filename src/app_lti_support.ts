import type { Context } from '@hono/hono';
import { resolveLtiProfileForDeployment } from './lti/profile_resolution.ts';
import { readLoginRequest } from './app_request_support.ts';
import { errorMessage, statusForError } from './app_status_support.ts';
import { renderLtiPlatformStorageLaunchPage, renderTopLevelLaunchPage } from './app_lti_views.ts';
import type { AppServices } from './app_services.ts';
import { recordInteropPathUsed } from './interop_audit.ts';
import type { PackageReviewRepository } from './package_review/repository.ts';
import type { DeploymentRecord } from './package_review/types.ts';
import { resolveLoginPolicy } from './lti/login_policy.ts';
import { syncLtiToolDeploymentBinding } from './lti/tool_provider.ts';
import { resolveRequestAppOrigin } from './app_origin.ts';

export async function handleLoginInitiation(context: Context, services: AppServices) {
  try {
    const loginRequest = await readLoginRequest(context);
    const repository = services.getRepository();
    const appOrigin = resolveRequestAppOrigin(context, services.env);
    const resolvedDeployment = await resolveLoginDeployment({
      repository,
      issuer: loginRequest.request.iss,
      clientId: loginRequest.request.clientId,
      deploymentId: loginRequest.request.deploymentId,
    });
    const deployment = resolvedDeployment.deployment;
    const binding = deployment.binding;

    if (binding === null) {
      throw new Error(
        `Deployment ${loginRequest.request.deploymentId} does not have a saved LMS binding.`,
      );
    }

    const ltiContext = await services.getLtiToolContext(appOrigin);
    if (resolvedDeployment.completedPendingCanvasBinding) {
      await syncLtiToolDeploymentBinding({
        storage: ltiContext.storage,
        appTitle: deployment.label,
        deploymentSlug: deployment.slug,
        binding,
      });
    }
    const ltiProfile = await resolveLtiProfileForDeployment({ repository, deployment });
    const loginPolicy = resolveLoginPolicy({
      appOrigin,
      binding,
      loginRequest,
      ltiProfile,
    });

    const location = await ltiContext.tool.handleLogin({
      iss: binding.issuer,
      client_id: binding.clientId,
      lti_deployment_id: binding.deploymentId,
      login_hint: loginPolicy.loginHint,
      target_link_uri: loginPolicy.targetLinkUri,
      launchUrl: `${appOrigin}/lti/launch`,
      ...(loginRequest.request.ltiMessageHint === null ? {} : {
        lti_message_hint: loginPolicy.ltiMessageHint,
      }),
    });
    const redirectUrl = new URL(location);
    const ltiStorageTarget = loginRequest.ltiStorageTarget;
    const usesLtiPlatformStorage = ltiStorageTarget !== null;
    const compatibilityPaths = [
      ...loginPolicy.compatibilityPaths,
      ...(usesLtiPlatformStorage ? ['lti_platform_storage'] : []),
      ...(!usesLtiPlatformStorage && context.req.header('sec-fetch-dest') === 'iframe'
        ? ['iframe_top_level_escape']
        : []),
    ];

    await Promise.all(
      compatibilityPaths.map((path) =>
        recordInteropPathUsed({
          repository,
          scope: 'login',
          path,
          actorType: 'platform',
          deploymentRecordId: deployment.id,
          packageVersionId: deployment.enabledPackageVersionId,
          summary: 'Lantern used an LTI login compatibility path.',
          detail: {
            deploymentSlug: deployment.slug,
            issuer: binding.issuer,
            clientId: binding.clientId,
            deploymentId: binding.deploymentId,
          },
          ltiProfile,
        })
      ),
    );

    if (usesLtiPlatformStorage) {
      return context.html(
        renderLtiPlatformStorageLaunchPage({
          location,
          platformOrigin: redirectUrl.origin,
          storageTarget: ltiStorageTarget,
          state: redirectUrl.searchParams.get('state') ?? '',
          nonce: redirectUrl.searchParams.get('nonce') ?? '',
        }),
      );
    }

    if (context.req.header('sec-fetch-dest') === 'iframe') {
      return context.html(
        renderTopLevelLaunchPage({
          location,
        }),
      );
    }

    return context.redirect(location, 302);
  } catch (error) {
    return context.text(errorMessage(error), statusForError(error));
  }
}

async function resolveLoginDeployment(input: {
  repository: PackageReviewRepository;
  issuer: string;
  clientId: string | null;
  deploymentId: string;
}): Promise<{
  deployment: DeploymentRecord;
  completedPendingCanvasBinding: boolean;
}> {
  let deployment = await input.repository.getDeploymentByPlatformIdentity({
    issuer: input.issuer,
    clientId: input.clientId,
    deploymentId: input.deploymentId,
  });

  let completedPendingCanvasBinding = false;

  if (deployment === null && input.clientId !== null) {
    deployment = await input.repository.completePendingCanvasBinding({
      issuer: input.issuer,
      clientId: input.clientId,
      deploymentId: input.deploymentId,
    });
    completedPendingCanvasBinding = deployment !== null;
  }

  if (deployment === null) {
    throw new Error(
      `Deployment ${
        input.clientId ?? '(missing client_id)'
      } / ${input.deploymentId} was not found for issuer ${input.issuer}.`,
    );
  }

  return {
    deployment,
    completedPendingCanvasBinding,
  };
}

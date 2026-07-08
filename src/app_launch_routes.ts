import type { Context, Hono, Next } from '@hono/hono';
import {
  type CustomDeepLinkingLaunchContext,
  customLaunchRouteHandler,
  type CustomResourceLinkLaunchContext,
} from '@longsightgroup/lti-tool/hono';
import type { LtiAuthorizedLaunch } from '@longsightgroup/lti-tool';
import { createRuntimeSession } from './lti/runtime_session.ts';
import { formatLmsLabel } from './lti/platform_binding.ts';
import {
  buildResolvedLtiProfileDetail,
  resolveLtiProfileForDeployment,
} from './lti/profile_resolution.ts';
import { handleLoginInitiation } from './app_lti_support.ts';
import { buildRuntimeSessionUrl, requireConfiguredRuntimeOrigin } from './runtime_origin.ts';
import { errorMessage, statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import { readEnv } from './platform/env.ts';
import type { PackageReviewRepository } from './package_review/repository.ts';
import { createDeepLinkingSession } from './lti/deep_linking_session.ts';
import { resolveRequestAppOrigin } from './app_origin.ts';
import {
  authorizeLanternLaunch,
  type LanternLaunchAuthorization,
  mapDeepLinkingLaunch,
  mapResourceLinkLaunch,
} from './lti/launch_mapping.ts';
import {
  readLaunchIdToken,
  readVerifiedDeepLinkingAcceptLineItemClaim,
} from './lti/deep_linking_launch_settings.ts';
import { adaptLtiToolHonoHandler } from './lti/hono_handler_adapter.ts';
import { recordLaunchRejectedAudit } from './lti/launch_audit.ts';
import { isLtiBoundaryDenialError } from './lti/lti_boundary_denial.ts';

export function registerLaunchRoutes(app: Hono, services: AppServices): void {
  app.get('/lti/login', async (context) => {
    return await handleLoginInitiation(context, services);
  });

  app.post('/lti/login', async (context) => {
    return await handleLoginInitiation(context, services);
  });

  const handleLaunch = async (context: Context, next: Next) => {
    const appOrigin = resolveRequestAppOrigin(context, services.env);
    const ltiContext = await services.getLtiToolContext(appOrigin);
    const repository = services.getRepository();
    const verificationAuditWrites: Array<Promise<unknown>> = [];
    const launchIdToken = await readLaunchIdToken(context.req.raw.clone());
    const handler = customLaunchRouteHandler<LanternLaunchAuthorization>({
      ltiTool: ltiContext.tool,
      logger: ltiContext.logger,
      authorizeLaunch: (launch) => authorizeLanternLaunch(repository, launch),
      renderResourceLink: (launchContext) =>
        renderLanternResourceLinkLaunch({
          services,
          repository,
          routeContext: context,
          launchContext,
        }),
      renderDeepLinkingRequest: (launchContext) =>
        renderLanternDeepLinkingLaunch({
          repository,
          launchContext,
          launchIdToken,
        }),
      onVerificationFailure: async ({ hono, error }) => {
        await recordLaunchRejectedAudit({
          repository,
          context,
          error,
        });

        return hono.text(error.message, 400);
      },
      onVerificationEvent: ({ event }) => {
        if (event.type !== 'jwks_kid_miss_refetch') {
          return;
        }

        verificationAuditWrites.push(
          repository.recordAuditEvent({
            eventType: 'interop.path_used',
            actorType: 'platform',
            actorId: null,
            deploymentRecordId: null,
            packageVersionId: null,
            attemptId: null,
            lineItemBindingId: null,
            status: 'succeeded',
            summary: 'Lantern refetched platform JWKS during LTI launch verification.',
            detail: {
              scope: 'launch',
              path: 'jwks_refetch',
              issuer: event.issuer,
              clientId: event.clientId,
              deploymentId: event.deploymentId,
              jwksUrl: event.jwksUrl,
            },
            occurredAt: new Date().toISOString(),
          }),
        );
      },
      onError: ({ hono, error }) => hono.text(errorMessage(error), statusForError(error)),
    });

    const lanternHandler = adaptLtiToolHonoHandler(handler);
    const response = await lanternHandler(context, next);
    await Promise.all(verificationAuditWrites);

    return response;
  };

  app.post('/lti/launch', handleLaunch);
  app.post('/lti/deep-linking', handleLaunch);
}

async function renderLanternResourceLinkLaunch(input: {
  services: AppServices;
  repository: PackageReviewRepository;
  routeContext: Context;
  launchContext: CustomResourceLinkLaunchContext<LtiAuthorizedLaunch<LanternLaunchAuthorization>>;
}): Promise<Response> {
  const deployment = input.launchContext.launch.authorization.deployment;
  const ltiProfile = await resolveLtiProfileForDeployment({
    repository: input.repository,
    deployment,
  });
  let launch: Awaited<ReturnType<typeof mapResourceLinkLaunch>>;

  try {
    launch = await mapResourceLinkLaunch({
      repository: input.repository,
      verifiedLaunch: input.launchContext.launch,
      session: input.launchContext.session,
      message: input.launchContext.message,
    });
  } catch (error) {
    if (isLtiBoundaryDenialError(error)) {
      await recordLaunchRejectedAudit({
        repository: input.repository,
        context: input.routeContext,
        error,
        deployment,
        ltiProfile,
      });
    }

    throw error;
  }
  const runtimeOrigin = requireConfiguredRuntimeOrigin(
    readEnv('APP_RUNTIME_ORIGIN', input.services.env),
  );
  const runtimeSession = await createRuntimeSession({
    repository: input.repository,
    launch,
    ltiToolSessionId: input.launchContext.session.id,
  });
  await input.repository.recordAuditEvent({
    eventType: 'launch.accepted',
    actorType: 'platform',
    actorId: launch.userId,
    deploymentRecordId: launch.internalDeploymentId,
    packageVersionId: launch.packageVersionId,
    attemptId: runtimeSession.attemptId,
    lineItemBindingId: null,
    status: 'accepted',
    summary: `Accepted the governed ${formatLmsLabel(launch.lms)} launch.`,
    detail: {
      lms: launch.lms,
      internalDeploymentSlug: launch.internalDeploymentSlug,
      issuer: launch.issuer,
      clientId: launch.clientId,
      deploymentId: launch.deploymentId,
      userId: launch.userId,
      userDisplayName: launch.userDisplayName,
      userEmail: launch.userEmail,
      userLogin: launch.userLogin,
      resourceLinkId: launch.resourceLinkId,
      contextId: launch.contextId,
      ...buildResolvedLtiProfileDetail(ltiProfile),
    },
    occurredAt: new Date().toISOString(),
  });

  return input.launchContext.hono.redirect(
    buildRuntimeSessionUrl({
      runtimeOrigin,
      sessionId: runtimeSession.sessionId,
      token: runtimeSession.sessionToken,
    }),
    303,
  );
}

async function renderLanternDeepLinkingLaunch(input: {
  repository: PackageReviewRepository;
  launchContext: CustomDeepLinkingLaunchContext<LtiAuthorizedLaunch<LanternLaunchAuthorization>>;
  launchIdToken: string | null;
}): Promise<Response> {
  const acceptLineItemClaim = readVerifiedDeepLinkingAcceptLineItemClaim(input.launchIdToken);

  if (!acceptLineItemClaim.success) {
    throw new Error(acceptLineItemClaim.message);
  }

  const request = mapDeepLinkingLaunch({
    verifiedLaunch: input.launchContext.launch,
    session: input.launchContext.session,
    message: input.launchContext.message,
    acceptLineItem: acceptLineItemClaim.value,
  });
  const session = await createDeepLinkingSession({
    repository: input.repository,
    request,
  });

  return input.launchContext.hono.redirect(
    `/lti/deep-linking/sessions/${session.sessionId}?token=${
      encodeURIComponent(
        session.sessionToken,
      )
    }`,
    303,
  );
}

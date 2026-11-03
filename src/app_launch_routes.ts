import type { Context, Hono, Next } from 'hono';
import {
  customLaunchRouteHandler,
  type CustomResourceLinkLaunchContext,
} from '@longsightgroup/lti-tool/hono';
import type { LtiAuthorizedLaunch } from '@longsightgroup/lti-tool';
import { handleLoginInitiation } from './app_lti_support.ts';
import { requireConfiguredRuntimeOrigin } from './runtime_origin.ts';
import { errorMessage, statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import { readEnv } from './platform/env.ts';
import { resolveRequestAppOrigin } from './app_origin.ts';
import type { LmsConnectionRecord } from './lms_kernel/types.ts';
import { createOpaqueToken } from './lti/token_support.ts';
import { buildRequestAuditEnvelope } from './request_audit.ts';
import {
  acceptResourceLinkLaunch,
  type GovernedLaunchPackage,
} from './lms_kernel/launch_service.ts';
import { launchDeniedEvent } from './lms_kernel/governance_events.ts';

interface AppLaunchAuthorization {
  readonly connection: LmsConnectionRecord;
}

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
    const handler = customLaunchRouteHandler<AppLaunchAuthorization>({
      ltiTool: ltiContext.tool,
      logger: ltiContext.logger,
      authorizeLaunch: async (launch) => {
        const connection = await services
          .getLmsKernelRepository()
          .getLmsConnectionByPlatformIdentity({
            issuer: launch.issuer,
            clientId: launch.clientId,
            deploymentId: launch.deploymentId,
          });
        if (connection === null || connection.status === 'disabled') {
          return {
            success: false,
            code: 'connection_not_found',
            message: 'No active institution LMS connection matches this launch.',
          };
        }
        return {
          success: true,
          data: { connection },
        };
      },
      renderResourceLink: (launchContext) =>
        renderGovernedResourceLinkLaunch({
          services,
          routeContext: context,
          launchContext,
        }),
      renderDeepLinkingRequest: (launchContext) =>
        launchContext.hono.text('Governed Worker apps do not use deep linking.', 400),
      onVerificationFailure: ({ hono, error }) => hono.text(error.message, 400),
      onError: ({ hono, error }) => hono.text(errorMessage(error), statusForError(error)),
    });

    const lanternHandler = handler;
    return await lanternHandler(context, next);
  };

  app.post('/lti/launch', handleLaunch);
}

async function renderGovernedResourceLinkLaunch(input: {
  services: AppServices;
  routeContext: Context;
  launchContext: CustomResourceLinkLaunchContext<LtiAuthorizedLaunch<AppLaunchAuthorization>>;
}): Promise<Response> {
  try {
    return await performGovernedResourceLinkLaunch(input);
  } catch (error) {
    const connection = input.launchContext.launch.authorization.connection;
    const audit = buildRequestAuditEnvelope({ context: input.routeContext });
    await input.services.getLmsKernelRepository().appendGovernanceEvent(
      launchDeniedEvent({
        traceId: crypto.randomUUID(),
        institutionId: connection.institutionId,
        lmsConnectionId: connection.id,
        errorCode: 'launch_denied',
        occurredAt: new Date().toISOString(),
        requestMetadata: {
          path: audit.path,
          ...(audit.cfRay === null ? {} : { cfRay: audit.cfRay }),
          ...(audit.clientIpMasked === null ? {} : { maskedIp: audit.clientIpMasked }),
        },
      }),
    );
    throw error;
  }
}

async function performGovernedResourceLinkLaunch(input: {
  services: AppServices;
  routeContext: Context;
  launchContext: CustomResourceLinkLaunchContext<LtiAuthorizedLaunch<AppLaunchAuthorization>>;
}): Promise<Response> {
  const connection = input.launchContext.launch.authorization.connection;
  const target = new URL(input.launchContext.launch.targetLinkUri);
  const nrps = input.launchContext.session.services?.nrps;
  const minted = await acceptResourceLinkLaunch({
    repository: input.services.getLmsKernelRepository(),
    connection,
    installationId: target.searchParams.get('installation_id') ?? '',
    providerContextId: input.launchContext.message.context?.id ?? '',
    contextLabel: input.launchContext.message.context?.title ?? null,
    providerSubjectId: input.launchContext.session.user.id ?? '',
    roles: input.launchContext.message.roles,
    ltiToolSessionId: input.launchContext.session.id,
    nrpsContextMembershipsUrl: nrps?.membershipUrl ?? null,
    nrpsServiceVersions: nrps === undefined ? [] : [...nrps.versions],
    loadPackageVersion: (lookup) => loadGovernedLaunchPackage(input.services, lookup),
    createId: createOpaqueToken,
    traceId: crypto.randomUUID(),
  });
  const runtimeOrigin = requireConfiguredRuntimeOrigin(
    readEnv('APP_RUNTIME_ORIGIN', input.services.env),
  );
  const url = new URL(
    `/governed/sessions/${encodeURIComponent(minted.runtimeSessionId)}`,
    runtimeOrigin,
  );
  url.searchParams.set('token', minted.runtimeSessionToken);
  return input.launchContext.hono.redirect(url.toString(), 303);
}

async function loadGovernedLaunchPackage(
  services: AppServices,
  lookup: { readonly packageVersionId: number; readonly appId: string },
): Promise<GovernedLaunchPackage | null> {
  const packageVersion = await services
    .getRepository()
    .getPackageVersionById(lookup.packageVersionId);
  if (
    packageVersion === null ||
    packageVersion.approvalStatus !== 'approved' ||
    packageVersion.runtime.kind !== 'worker' ||
    packageVersion.appId !== lookup.appId
  ) {
    return null;
  }
  return {
    appId: packageVersion.appId,
    id: packageVersion.id,
    version: packageVersion.version,
    capabilities: packageVersion.capabilities,
  };
}

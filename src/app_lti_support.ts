import type { Context } from 'hono';
import { readLoginRequest } from './app_request_support.ts';
import { errorMessage, statusForError } from './app_status_support.ts';
import { renderLtiPlatformStorageLaunchPage, renderTopLevelLaunchPage } from './app_lti_views.ts';
import type { AppServices } from './app_services.ts';
import { syncLtiToolConnection } from './lti/tool_provider.ts';
import { resolveRequestAppOrigin } from './app_origin.ts';

export async function handleLoginInitiation(context: Context, services: AppServices) {
  try {
    const loginRequest = await readLoginRequest(context);
    const appOrigin = resolveRequestAppOrigin(context, services.env);
    if (loginRequest.request.clientId === null) {
      throw new Error('LTI login initiation requires client_id.');
    }
    const connection = await services.getLmsKernelRepository().getLmsConnectionByPlatformIdentity({
      issuer: loginRequest.request.iss,
      clientId: loginRequest.request.clientId,
      deploymentId: loginRequest.request.deploymentId,
    });
    if (connection === null || connection.status === 'disabled') {
      throw new Error('No active institution LMS connection matches this login request.');
    }
    const targetLinkUri = requireGovernedTargetLinkUri({
      appOrigin,
      targetLinkUri: loginRequest.request.targetLinkUri,
    });
    const installationId = new URL(targetLinkUri).searchParams.get('installation_id');
    if (installationId === null) {
      throw new Error('Governed app launch target is missing installation_id.');
    }
    const installation = await services
      .getLmsKernelRepository()
      .getInstallationById(installationId);
    if (
      installation === null ||
      installation.institutionId !== connection.institutionId ||
      installation.status !== 'active'
    ) {
      throw new Error('The governed app installation is not active for this LMS connection.');
    }
    const ltiContext = await services.getLtiToolContext(appOrigin);
    await syncLtiToolConnection({ storage: ltiContext.storage, connection });
    const location = await ltiContext.tool.handleLogin({
      iss: connection.issuer,
      client_id: connection.clientId,
      lti_deployment_id: connection.deploymentId,
      login_hint: loginRequest.compatibility.decodedLoginHint ?? loginRequest.request.loginHint,
      target_link_uri: targetLinkUri,
      launchUrl: `${appOrigin}/lti/launch`,
      ...(loginRequest.request.ltiMessageHint === null
        ? {}
        : {
            lti_message_hint:
              loginRequest.compatibility.decodedLtiMessageHint ??
              loginRequest.request.ltiMessageHint,
          }),
    });
    return renderLoginRedirect(context, {
      location,
      storageTarget: loginRequest.ltiStorageTarget,
    });
  } catch (error) {
    return context.text(errorMessage(error), statusForError(error));
  }
}

function requireGovernedTargetLinkUri(input: {
  readonly appOrigin: string;
  readonly targetLinkUri: string | null;
}): string {
  if (input.targetLinkUri === null) {
    throw new Error('Governed app launches require target_link_uri.');
  }
  const target = new URL(input.targetLinkUri);
  const expectedOrigin = new URL(input.appOrigin).origin;
  if (
    target.origin !== expectedOrigin ||
    target.pathname !== '/lti/launch' ||
    (target.searchParams.get('installation_id')?.trim() ?? '') === ''
  ) {
    throw new Error(
      'Governed app target_link_uri must be Lantern’s launch URL with an installation_id.',
    );
  }
  return target.toString();
}

function renderLoginRedirect(
  context: Context,
  input: {
    readonly location: string;
    readonly storageTarget: string | null;
  },
): Response {
  const redirectUrl = new URL(input.location);
  if (input.storageTarget !== null) {
    return context.html(
      renderLtiPlatformStorageLaunchPage({
        location: input.location,
        platformOrigin: redirectUrl.origin,
        storageTarget: input.storageTarget,
        state: redirectUrl.searchParams.get('state') ?? '',
        nonce: redirectUrl.searchParams.get('nonce') ?? '',
      }),
    );
  }
  if (context.req.header('sec-fetch-dest') === 'iframe') {
    return context.html(renderTopLevelLaunchPage({ location: input.location }));
  }
  return context.redirect(input.location, 302);
}

import type { Hono } from '@hono/hono';
import { renderDeepLinkingPickerResponse } from './app_deep_linking_views.ts';
import { requireTrimmedFormValue, requireTrimmedString } from './app_request_support.ts';
import { errorMessage, statusForDeepLinkingSessionError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import { readEnv } from './platform/env.ts';
import { launchPreviewRuntimeSession } from './preview/service.ts';
import { buildRuntimeSessionUrl, requireConfiguredRuntimeOrigin } from './runtime_origin.ts';
import {
  listDeepLinkingResources,
  requireAuthorizedDeepLinkingSession,
  resolveDeepLinkingSelection,
  saveDeepLinkingSessionSelection,
} from './lti/deep_linking.ts';

export function registerDeepLinkingRoutes(app: Hono, services: AppServices): void {
  app.get('/lti/deep-linking/sessions/:sessionId', async (context) => {
    try {
      const repository = services.getRepository();
      const url = new URL(context.req.url);
      const session = await requireAuthorizedDeepLinkingSession({
        repository,
        sessionId: context.req.param('sessionId'),
        token: requireTrimmedString(
          url.searchParams.get('token'),
          'Deep Linking session token is required.',
        ),
      });

      return await renderDeepLinkingPickerResponse({
        context,
        repository,
        session,
        token: session.sessionToken,
        notice: null,
      });
    } catch (error) {
      return context.text(errorMessage(error), statusForDeepLinkingSessionError(error));
    }
  });

  app.post('/lti/deep-linking/sessions/:sessionId', async (context) => {
    const repository = services.getRepository();
    const formData = await context.req.formData();

    try {
      const session = await requireAuthorizedDeepLinkingSession({
        repository,
        sessionId: context.req.param('sessionId'),
        token: requireTrimmedFormValue(
          formData.get('token'),
          'Deep Linking session token is required.',
        ),
      });

      try {
        const saved = await saveDeepLinkingSessionSelection({
          repository,
          session,
          selectionValue: requireTrimmedFormValue(
            formData.get('selection'),
            'Choose one reviewed resource before continuing.',
          ),
        });

        return await renderDeepLinkingPickerResponse({
          context,
          repository,
          session: saved.session,
          token: session.sessionToken,
          notice: {
            tone: 'success',
            title: 'Selection saved',
            detail:
              'Lantern saved the reviewed version and content path. Use the verified return action to post this selection back to the LMS.',
          },
        });
      } catch (error) {
        return await renderDeepLinkingPickerResponse({
          context,
          repository,
          session,
          token: session.sessionToken,
          notice: {
            tone: 'error',
            title: 'Selection blocked',
            detail: errorMessage(error),
          },
          status: 400,
        });
      }
    } catch (error) {
      return context.text(errorMessage(error), statusForDeepLinkingSessionError(error));
    }
  });

  app.post('/lti/deep-linking/sessions/:sessionId/preview', async (context) => {
    const repository = services.getRepository();
    const formData = await context.req.formData();

    try {
      const session = await requireAuthorizedDeepLinkingSession({
        repository,
        sessionId: context.req.param('sessionId'),
        token: requireTrimmedFormValue(
          formData.get('token'),
          'Deep Linking session token is required.',
        ),
      });

      try {
        const selection = resolveDeepLinkingSelection({
          session,
          resources: await listDeepLinkingResources({
            repository,
            session,
          }),
        });

        if (selection === null) {
          return await renderDeepLinkingPickerResponse({
            context,
            repository,
            session,
            token: session.sessionToken,
            notice: {
              tone: 'error',
              title: 'Preview blocked',
              detail: buildDeepLinkingPreviewMissingSelectionDetail(session.placement),
            },
            status: 409,
          });
        }

        const packageVersion = await repository.getPackageVersionById(selection.packageVersionId);

        if (packageVersion === null) {
          throw new Error(
            `Reviewed package version ${selection.packageVersionId} could not be loaded for preview.`,
          );
        }

        const launched = await launchPreviewRuntimeSession({
          repository,
          packageVersion,
          artifactStore: services.runtimeArtifactStore,
          launch: {
            userRole: 'instructor',
            courseId: session.contextId ?? 'deep-linking-context',
            assignmentId: null,
            activityId: selection.activityId,
            contentPath: selection.contentPath,
          },
          previewOrigin: 'deepLinkingAuthoring',
          deepLinkingSessionId: session.sessionId,
        });
        const runtimeOrigin = requireConfiguredRuntimeOrigin(
          readEnv('APP_RUNTIME_ORIGIN', services.env),
        );

        return context.redirect(
          buildRuntimeSessionUrl({
            runtimeOrigin,
            sessionId: launched.runtimeSession.sessionId,
            token: launched.runtimeSession.sessionToken,
          }),
          303,
        );
      } catch (error) {
        return await renderDeepLinkingPickerResponse({
          context,
          repository,
          session,
          token: session.sessionToken,
          notice: {
            tone: 'error',
            title: 'Preview blocked',
            detail: errorMessage(error),
          },
          status: 409,
        });
      }
    } catch (error) {
      return context.text(errorMessage(error), statusForDeepLinkingSessionError(error));
    }
  });
}

function buildDeepLinkingPreviewMissingSelectionDetail(
  placement: 'assignment_selection' | 'resource_selection',
): string {
  const resource = placement === 'resource_selection' ? 'course resource' : 'assignment resource';

  return `Save one reviewed ${resource} before previewing it in Lantern.`;
}

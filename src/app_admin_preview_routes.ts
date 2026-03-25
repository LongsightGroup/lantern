import type { Hono } from '@hono/hono';
import { renderPackageDetailPage } from './admin/package_detail.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import { renderPreviewPage } from './admin/preview_page.ts';
import { loadPreviewCapabilityLog } from './app_deployment_support.ts';
import { createErrorNotice } from './app_notice_support.ts';
import { statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import { launchPreviewRuntimeSession, preparePreviewSession } from './preview/service.ts';

export function registerAdminPreviewRoutes(app: Hono, services: AppServices): void {
  app.get('/admin/packages/:appId/versions/:version/preview', async (context) => {
    const repository = services.getRepository();
    const appId = context.req.param('appId');
    const version = context.req.param('version');

    try {
      const packageVersion = await repository.getPackageVersionByAppVersion(appId, version);

      if (!packageVersion) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: 'error',
              title: 'Package version not found',
              detail: 'Lantern could not find that exact app version in the review inventory.',
            },
          }),
          404,
        );
      }

      const previewSession = await preparePreviewSession({
        packageVersion,
      });
      const { session, evidence } = await loadPreviewCapabilityLog({
        repository,
        packageVersionId: packageVersion.id,
      });
      await repository.recordAuditEvent({
        eventType: 'reviewer.preview_viewed',
        actorType: 'user',
        actorId: null,
        deploymentRecordId: null,
        packageVersionId: packageVersion.id,
        attemptId: null,
        lineItemBindingId: null,
        status: 'succeeded',
        summary: 'Reviewer opened governed preview evidence.',
        detail: {
          appId: packageVersion.appId,
          packageVersion: packageVersion.version,
          previewSessionId: (session ?? previewSession).sessionId,
          previewEvidenceCount: evidence.length,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.html(
        renderPreviewPage({
          packageVersion,
          previewSession: session ?? previewSession,
          previewEvidence: evidence,
        }),
      );
    } catch (error) {
      const packageVersion = await repository.getPackageVersionByAppVersion(appId, version);

      if (!packageVersion) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: createErrorNotice('Preview launch unavailable', error),
          }),
          statusForError(error),
        );
      }

      const history = await repository.listPackageVersionsByApp(appId);

      return context.html(
        renderPackageDetailPage({
          packageVersion,
          history,
          notice: createErrorNotice('Preview launch unavailable', error),
        }),
        statusForError(error),
      );
    }
  });

  app.post('/admin/packages/:appId/versions/:version/preview', async (context) => {
    const repository = services.getRepository();
    const appId = context.req.param('appId');
    const version = context.req.param('version');

    try {
      const packageVersion = await repository.getPackageVersionByAppVersion(appId, version);

      if (!packageVersion) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: 'error',
              title: 'Package version not found',
              detail: 'Lantern could not find that exact app version in the review inventory.',
            },
          }),
          404,
        );
      }

      const launched = await launchPreviewRuntimeSession({
        repository,
        packageVersion,
      });

      await repository.recordAuditEvent({
        eventType: 'preview.launch',
        actorType: 'user',
        actorId: null,
        deploymentRecordId: null,
        packageVersionId: packageVersion.id,
        attemptId: launched.runtimeSession.attemptId,
        lineItemBindingId: null,
        status: 'succeeded',
        summary: 'Launched a governed preview runtime session.',
        detail: {
          previewSessionId: launched.previewSession.sessionId,
          runtimeSessionId: launched.runtimeSession.sessionId,
          appId: packageVersion.appId,
          packageVersion: packageVersion.version,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(
        `/runtime/sessions/${launched.runtimeSession.sessionId}?token=${encodeURIComponent(
          launched.runtimeSession.sessionToken,
        )}`,
        303,
      );
    } catch (error) {
      const packageVersion = await repository.getPackageVersionByAppVersion(appId, version);

      if (!packageVersion) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: createErrorNotice('Preview launch blocked', error),
          }),
          statusForError(error),
        );
      }

      let previewSession = null;

      try {
        previewSession = await preparePreviewSession({
          packageVersion,
        });
      } catch {
        previewSession = null;
      }

      if (previewSession !== null) {
        const { session, evidence } = await loadPreviewCapabilityLog({
          repository,
          packageVersionId: packageVersion.id,
        });

        return context.html(
          renderPreviewPage({
            packageVersion,
            previewSession: session ?? previewSession,
            previewEvidence: evidence,
            notice: createErrorNotice('Preview launch blocked', error),
          }),
          statusForError(error),
        );
      }

      const history = await repository.listPackageVersionsByApp(appId);

      return context.html(
        renderPackageDetailPage({
          packageVersion,
          history,
          notice: createErrorNotice('Preview launch blocked', error),
        }),
        statusForError(error),
      );
    }
  });
}

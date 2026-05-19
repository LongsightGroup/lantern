import type { Hono } from '@hono/hono';
import type { UserRole } from '../sdk/app-sdk.ts';
import { renderPackageDetailPage } from './admin/package_detail.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import { renderPreviewPage, type TestLaunchFormValues } from './admin/preview_page.ts';
import { loadPreviewCapabilityLog } from './app_deployment_support.ts';
import { createErrorNotice } from './app_notice_support.ts';
import { formValueAsString } from './app_request_support.ts';
import { statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import { readEnv } from './platform/env.ts';
import type { PreviewSessionRecord } from './package_review/types.ts';
import { buildRuntimeSessionUrl, requireConfiguredRuntimeOrigin } from './runtime_origin.ts';
import {
  launchPreviewRuntimeSession,
  preparePreviewSession,
  type PreviewLaunchOverrides,
} from './preview/service.ts';

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
              title: 'Version not found',
              detail: 'Lantern could not find that app version.',
            },
          }),
          404,
        );
      }

      const savedDefaults = await preparePreviewSession({
        packageVersion,
        artifactStore: services.runtimeArtifactStore,
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
        summary: 'Reviewer opened the test launch page.',
        detail: {
          appId: packageVersion.appId,
          packageVersion: packageVersion.version,
          previewSessionId: session?.sessionId ?? null,
          previewEvidenceCount: evidence.length,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.html(
        renderPreviewPage({
          packageVersion,
          savedDefaults,
          latestSession: session,
          formValues: buildTestLaunchFormValuesFromSession(session ?? savedDefaults),
          previewEvidence: evidence,
        }),
      );
    } catch (error) {
      const packageVersion = await repository.getPackageVersionByAppVersion(appId, version);

      if (!packageVersion) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: createErrorNotice('Test launch unavailable', error),
          }),
          statusForError(error),
        );
      }

      const history = await repository.listPackageVersionsByApp(appId);

      return context.html(
        renderPackageDetailPage({
          packageVersion,
          history,
          notice: createErrorNotice('Test launch unavailable', error),
        }),
        statusForError(error),
      );
    }
  });

  app.post('/admin/packages/:appId/versions/:version/preview', async (context) => {
    const repository = services.getRepository();
    const appId = context.req.param('appId');
    const version = context.req.param('version');
    let formValues: TestLaunchFormValues | null = null;

    try {
      const packageVersion = await repository.getPackageVersionByAppVersion(appId, version);

      if (!packageVersion) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: 'error',
              title: 'Version not found',
              detail: 'Lantern could not find that app version.',
            },
          }),
          404,
        );
      }

      const formData = await context.req.formData();
      formValues = buildTestLaunchFormValuesFromFormData(formData);
      const launched = await launchPreviewRuntimeSession({
        repository,
        packageVersion,
        artifactStore: services.runtimeArtifactStore,
        launch: buildTestLaunchOverrides(formValues),
      });
      const runtimeOrigin = requireConfiguredRuntimeOrigin(
        readEnv('APP_RUNTIME_ORIGIN', services.env),
      );

      await repository.recordAuditEvent({
        eventType: 'preview.launch',
        actorType: 'user',
        actorId: null,
        deploymentRecordId: null,
        packageVersionId: packageVersion.id,
        attemptId: launched.runtimeSession.attemptId,
        lineItemBindingId: null,
        status: 'succeeded',
        summary: 'Started a test launch without LMS sign-in.',
        detail: {
          previewSessionId: launched.previewSession.sessionId,
          runtimeSessionId: launched.runtimeSession.sessionId,
          appId: packageVersion.appId,
          packageVersion: packageVersion.version,
          userRole: launched.previewSession.launch.userRole,
          courseId: launched.previewSession.launch.courseId,
          assignmentId: launched.previewSession.launch.assignmentId,
          activityId: launched.previewSession.launch.activityId,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(
        buildRuntimeSessionUrl({
          runtimeOrigin,
          sessionId: launched.runtimeSession.sessionId,
          token: launched.runtimeSession.sessionToken,
        }),
        303,
      );
    } catch (error) {
      const packageVersion = await repository.getPackageVersionByAppVersion(appId, version);

      if (!packageVersion) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: createErrorNotice('Test launch blocked', error),
          }),
          statusForError(error),
        );
      }

      let savedDefaults = null;

      try {
        savedDefaults = await preparePreviewSession({
          packageVersion,
          artifactStore: services.runtimeArtifactStore,
        });
      } catch {
        savedDefaults = null;
      }

      if (savedDefaults !== null) {
        const { session, evidence } = await loadPreviewCapabilityLog({
          repository,
          packageVersionId: packageVersion.id,
        });

        return context.html(
          renderPreviewPage({
            packageVersion,
            savedDefaults,
            latestSession: session,
            formValues: formValues ??
              buildTestLaunchFormValuesFromSession(session ?? savedDefaults),
            previewEvidence: evidence,
            notice: createErrorNotice('Test launch blocked', error),
          }),
          statusForError(error),
        );
      }

      const history = await repository.listPackageVersionsByApp(appId);

      return context.html(
        renderPackageDetailPage({
          packageVersion,
          history,
          notice: createErrorNotice('Test launch blocked', error),
        }),
        statusForError(error),
      );
    }
  });
}

function buildTestLaunchFormValuesFromSession(
  previewSession: PreviewSessionRecord,
): TestLaunchFormValues {
  return {
    userRole: previewSession.launch.userRole,
    courseId: previewSession.launch.courseId,
    assignmentId: previewSession.launch.assignmentId ?? '',
    activityId: previewSession.launch.activityId,
  };
}

function buildTestLaunchFormValuesFromFormData(formData: FormData): TestLaunchFormValues {
  return {
    userRole: normalizeFormValue(formData.get('userRole')),
    courseId: normalizeFormValue(formData.get('courseId')),
    assignmentId: normalizeFormValue(formData.get('assignmentId')),
    activityId: normalizeFormValue(formData.get('activityId')),
  };
}

function buildTestLaunchOverrides(formValues: TestLaunchFormValues): PreviewLaunchOverrides {
  return {
    userRole: parseTestLaunchUserRole(formValues.userRole),
    courseId: formValues.courseId,
    assignmentId: formValues.assignmentId === '' ? null : formValues.assignmentId,
    activityId: formValues.activityId,
  };
}

function parseTestLaunchUserRole(value: string): UserRole {
  switch (value) {
    case 'learner':
    case 'instructor':
      return value;
    default:
      throw new Error('Choose Student or Instructor.');
  }
}

function normalizeFormValue(value: FormDataEntryValue | null): string {
  return formValueAsString(value)?.trim() ?? '';
}

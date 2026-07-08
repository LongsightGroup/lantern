import type { Hono } from '@hono/hono';
import { startAppPackageRevisionRun } from './app_writer/service.ts';
import { preflightLocalAppPackageSource } from './authoring/local_app.ts';
import {
  handleReviewDecision,
  renderInventoryError,
  renderPackagesPage,
} from './app_admin_support.ts';
import { createErrorNotice, packageOverviewPath } from './app_notice_support.ts';
import { requireTrimmedFormValue } from './app_request_support.ts';
import { statusForError } from './app_status_support.ts';
import { loadPreviewCapabilityLog } from './app_deployment_support.ts';
import type { AppServices } from './app_services.ts';
import { adminPageInput } from './admin_auth/page_input.ts';
import {
  createUploadedPackageSource,
  requireSupportedReferencePackageId,
  statusForPackageImportError,
} from './app_admin_package_import_support.ts';
import {
  nextRevisionVersion,
  recordRevisionWorkflowQueuedEvent,
  requireVersionString,
  resolvePreviousPackageVersion,
} from './app_admin_revision_support.ts';
import { scheduleAppWriterContinuation } from './app_writer/background_execution.ts';
import { renderPackageDetailPage } from './admin/package_detail.ts';
import { renderPackageDiffPage } from './admin/package_diff_page.ts';
import { renderPackageImportPage } from './admin/package_import_page.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import { renderPackageOverviewPage } from './admin/package_overview.ts';
import { renderPackageReportsPage } from './admin/package_reports.ts';
import { renderReferencePackagePage } from './admin/package_reference_page.ts';
import { renderAppRevisionPage } from './admin/app_revision_page.ts';
import { comparePackageVersions } from './package_review/package_diff.ts';
import { buildInstructorReport } from './reports/instructor_report.ts';

export function registerAdminInventoryRoutes(app: Hono, services: AppServices): void {
  app.get('/admin/packages', async (context) => {
    try {
      return await renderPackagesPage(context, services);
    } catch (error) {
      return context.html(
        renderPackageIndexPage(adminPageInput(context, {
          versions: [],
          notice: createErrorNotice('Package inventory unavailable', error),
        })),
        statusForError(error),
      );
    }
  });

  app.get('/admin/packages/import', (context) => {
    return context.html(renderPackageImportPage(adminPageInput(context, {})));
  });

  app.post('/admin/packages/import', async (context) => {
    try {
      const repository = services.getRepository();
      const formData = await context.req.formData();
      const source = await createUploadedPackageSource(formData);
      const preflight = await preflightLocalAppPackageSource(source);

      if (!preflight.ok || !preflight.validatedPackage) {
        return context.html(
          renderPackageImportPage(adminPageInput(context, {
            notice: {
              tone: 'error',
              title: 'Package import blocked',
              detail: 'Resolve the reviewed package findings below and try again.',
            },
            diagnostics: preflight.diagnostics,
          })),
          409,
        );
      }

      const reviewData = preflight.validatedPackage.reviewData;
      const existing = await repository.getPackageVersionByAppVersion(
        reviewData.appId,
        reviewData.version,
      );

      if (existing) {
        return context.redirect(packageOverviewPath(existing.appId), 303);
      }

      const storedPackage = await services.loadPackageSnapshotFromSource(source);

      if (storedPackage) {
        const packageVersion = await repository.registerPackageVersion(storedPackage);

        return context.redirect(packageOverviewPath(packageVersion.appId), 303);
      }

      const imported = await services.importPackageFromSource(source);
      const packageVersion = await repository.registerPackageVersion(imported);

      return context.redirect(packageOverviewPath(packageVersion.appId), 303);
    } catch (error) {
      return context.html(
        renderPackageImportPage(adminPageInput(context, {
          notice: createErrorNotice('Package import blocked', error),
        })),
        statusForPackageImportError(error),
      );
    }
  });

  app.post('/admin/packages/import-reference', async (context) => {
    try {
      const repository = services.getRepository();
      const formData = await context.req.formData();
      const appId = requireSupportedReferencePackageId(formData.get('appId'));
      const referencePackage = await services.readReferencePackageReviewData(appId);
      const existing = await repository.getPackageVersionByAppVersion(
        referencePackage.appId,
        referencePackage.version,
      );

      if (existing) {
        return context.redirect(packageOverviewPath(existing.appId), 303);
      }

      const storedReferencePackage = await services.loadReferencePackageSnapshot(appId);

      if (storedReferencePackage) {
        const packageVersion = await repository.registerPackageVersion(storedReferencePackage);

        return context.redirect(packageOverviewPath(packageVersion.appId), 303);
      }

      const imported = await services.importReferencePackage(appId);
      const packageVersion = await repository.registerPackageVersion(imported);

      return context.redirect(packageOverviewPath(packageVersion.appId), 303);
    } catch (error) {
      return await renderInventoryError(context, services, 'Reference app import blocked', error);
    }
  });

  app.get('/admin/packages/reference', (context) => {
    return context.html(renderReferencePackagePage(adminPageInput(context, {})));
  });

  app.get('/admin/packages/:appId', async (context) => {
    const appId = context.req.param('appId');

    try {
      const repository = services.getRepository();
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage(adminPageInput(context, {
            versions: await repository.listPackageVersions(),
            notice: {
              tone: 'error',
              title: 'App not found',
              detail: 'Lantern could not find that app.',
            },
          })),
          404,
        );
      }

      const deployments = await repository.listDeploymentsByApp(appId);

      return context.html(
        renderPackageOverviewPage(adminPageInput(context, {
          appId,
          appTitle: history[0]?.title ?? appId,
          history,
          deployments,
        })),
      );
    } catch (error) {
      try {
        const repository = services.getRepository();

        return context.html(
          renderPackageIndexPage(adminPageInput(context, {
            versions: await repository.listPackageVersions(),
            notice: createErrorNotice('App details unavailable', error),
          })),
          statusForError(error),
        );
      } catch {
        return context.html(
          renderPackageIndexPage(adminPageInput(context, {
            versions: [],
            notice: createErrorNotice('App details unavailable', error),
          })),
          statusForError(error),
        );
      }
    }
  });

  app.get('/admin/packages/:appId/reports', async (context) => {
    const appId = context.req.param('appId');

    try {
      const repository = services.getRepository();
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage(adminPageInput(context, {
            versions: await repository.listPackageVersions(),
            notice: {
              tone: 'error',
              title: 'App not found',
              detail: 'Lantern could not find that app.',
            },
          })),
          404,
        );
      }

      const report = await buildInstructorReport({
        repository,
        appId,
        generatedAt: new Date().toISOString(),
      });

      return context.html(
        renderPackageReportsPage(adminPageInput(context, {
          appId,
          appTitle: history[0]?.title ?? appId,
          history,
          report,
        })),
      );
    } catch (error) {
      return context.html(
        renderPackageIndexPage(adminPageInput(context, {
          versions: [],
          notice: createErrorNotice('Instructor reports unavailable', error),
        })),
        statusForError(error),
      );
    }
  });

  app.get('/admin/packages/:appId/versions/:version', async (context) => {
    try {
      const repository = services.getRepository();
      const packageVersion = await repository.getPackageVersionByAppVersion(
        context.req.param('appId'),
        context.req.param('version'),
      );

      if (!packageVersion) {
        return context.html(
          renderPackageIndexPage(adminPageInput(context, {
            versions: [],
            notice: {
              tone: 'error',
              title: 'Version not found',
              detail: 'Lantern could not find that app version.',
            },
          })),
          404,
        );
      }

      const history = await repository.listPackageVersionsByApp(packageVersion.appId);
      const generationActivityEvents = await repository.listAuditEventsByEventType(
        'app_generation.saved_pending_version',
      );
      const reviewedPlacements = await repository.listReviewedPlacementsByPackageVersion(
        packageVersion.id,
      );
      const runtimeLog = await loadPreviewCapabilityLog({
        repository,
        packageVersionId: packageVersion.id,
      });

      return context.html(
        renderPackageDetailPage(adminPageInput(context, {
          packageVersion,
          history,
          generationActivityEvents: generationActivityEvents.filter(
            (event) => event.packageVersionId === packageVersion.id,
          ),
          reviewedPlacements,
          latestPreviewSession: runtimeLog.session,
          previewEvidence: runtimeLog.evidence,
        })),
      );
    } catch (error) {
      return context.html(
        renderPackageIndexPage(adminPageInput(context, {
          versions: [],
          notice: createErrorNotice('Version details unavailable', error),
        })),
        statusForError(error),
      );
    }
  });

  app.get('/admin/packages/:appId/versions/:version/diff', async (context) => {
    try {
      const repository = services.getRepository();
      const packageVersion = await repository.getPackageVersionByAppVersion(
        context.req.param('appId'),
        context.req.param('version'),
      );

      if (!packageVersion) {
        return context.html(
          renderPackageIndexPage(adminPageInput(context, {
            versions: [],
            notice: {
              tone: 'error',
              title: 'Version not found',
              detail: 'Lantern could not find that app version.',
            },
          })),
          404,
        );
      }

      const history = await repository.listPackageVersionsByApp(packageVersion.appId);
      const baseVersion = resolvePreviousPackageVersion(history, packageVersion);

      if (baseVersion === null) {
        return context.html(
          renderPackageDetailPage(adminPageInput(context, {
            packageVersion,
            history,
            notice: {
              tone: 'note',
              title: 'No earlier version to compare',
              detail: 'Lantern needs at least two saved versions before it can show changes.',
            },
          })),
          404,
        );
      }

      const diff = await comparePackageVersions({
        snapshotStore: services.packageSnapshotStore,
        baseVersion,
        targetVersion: packageVersion,
      });

      return context.html(
        renderPackageDiffPage(adminPageInput(context, {
          diff,
          history,
        })),
      );
    } catch (error) {
      return context.html(
        renderPackageIndexPage(adminPageInput(context, {
          versions: [],
          notice: createErrorNotice('Version changes unavailable', error),
        })),
        statusForError(error),
      );
    }
  });

  app.get('/admin/packages/:appId/versions/:version/revise', async (context) => {
    try {
      const repository = services.getRepository();
      const packageVersion = await repository.getPackageVersionByAppVersion(
        context.req.param('appId'),
        context.req.param('version'),
      );

      if (!packageVersion) {
        return context.html(
          renderPackageIndexPage(adminPageInput(context, {
            versions: [],
            notice: {
              tone: 'error',
              title: 'Version not found',
              detail: 'Lantern could not find that app version.',
            },
          })),
          404,
        );
      }

      const history = await repository.listPackageVersionsByApp(packageVersion.appId);

      return context.html(
        renderAppRevisionPage(adminPageInput(context, {
          packageVersion,
          history,
          targetVersion: nextRevisionVersion(packageVersion.version, history),
        })),
      );
    } catch (error) {
      return context.html(
        renderPackageIndexPage(adminPageInput(context, {
          versions: [],
          notice: createErrorNotice('Revision form unavailable', error),
        })),
        statusForError(error),
      );
    }
  });

  app.post('/admin/packages/:appId/versions/:version/revise', async (context) => {
    let promptText = '';
    let targetVersion = '';

    try {
      const repository = services.getRepository();
      const packageVersion = await repository.getPackageVersionByAppVersion(
        context.req.param('appId'),
        context.req.param('version'),
      );

      if (!packageVersion) {
        return context.html(
          renderPackageIndexPage(adminPageInput(context, {
            versions: [],
            notice: {
              tone: 'error',
              title: 'Version not found',
              detail: 'Lantern could not find that app version.',
            },
          })),
          404,
        );
      }

      const formData = await context.req.formData();
      promptText = requireTrimmedFormValue(
        formData.get('promptText'),
        'Describe the changes Lantern should make.',
      );
      targetVersion = requireVersionString(formData.get('targetVersion'));

      if (targetVersion === packageVersion.version) {
        throw new Error('Choose a new version number for the revision.');
      }

      const existingTarget = await repository.getPackageVersionByAppVersion(
        packageVersion.appId,
        targetVersion,
      );

      if (existingTarget !== null) {
        throw new Error(`Package version ${packageVersion.appId}@${targetVersion} already exists.`);
      }

      const generationId = `generation-${crypto.randomUUID()}`;
      const started = await startAppPackageRevisionRun({
        repository,
        workspaceRunner: services.appWriterWorkspaceRunner,
        packageSnapshotStore: services.packageSnapshotStore,
        previewer: services.appPackagePreviewer,
        sourceCompiler: services.appPackageSourceCompiler,
        savePackage: {
          importPackageFromSource: services.importPackageFromSource,
        },
        generationId,
        ownerId: 'admin',
        promptText,
        requestedAppId: packageVersion.appId,
        sourcePackageVersion: packageVersion,
        targetVersion,
      });
      const scheduleResult = await services.appGenerationRunScheduler.schedule({
        generationId: started.run.generationId,
      });

      if (scheduleResult.mode === 'workflow') {
        await recordRevisionWorkflowQueuedEvent({
          repository,
          run: started.run,
          workflowInstanceId: scheduleResult.workflowInstanceId,
        });
      } else {
        scheduleAppWriterContinuation(
          context,
          started.continueGeneration(),
          started.run.generationId,
          'revision',
        );
      }

      await services.appWriterAgentSessions.observe({
        generationId: started.run.generationId,
        ownerId: started.run.ownerId,
        workflowInstanceId: scheduleResult.mode === 'workflow'
          ? scheduleResult.workflowInstanceId
          : null,
        observedAt: started.run.updatedAt,
      });

      return context.redirect(`/admin/app-writer/runs/${started.run.generationId}`, 303);
    } catch (error) {
      const repository = services.getRepository();
      const packageVersion = await repository.getPackageVersionByAppVersion(
        context.req.param('appId'),
        context.req.param('version'),
      );
      const history = packageVersion === null
        ? []
        : await repository.listPackageVersionsByApp(packageVersion.appId);

      return context.html(
        packageVersion === null
          ? renderPackageIndexPage(adminPageInput(context, {
            versions: await repository.listPackageVersions(),
            notice: createErrorNotice('Revision blocked', error),
          }))
          : renderAppRevisionPage(adminPageInput(context, {
            packageVersion,
            history,
            promptText,
            targetVersion: targetVersion === ''
              ? nextRevisionVersion(packageVersion.version, history)
              : targetVersion,
            notice: createErrorNotice('Revision blocked', error),
          })),
        statusForError(error),
      );
    }
  });

  app.post('/admin/packages/:id/approve', async (context) => {
    return await handleReviewDecision(context, services, 'approve');
  });

  app.post('/admin/packages/:id/reject', async (context) => {
    return await handleReviewDecision(context, services, 'reject');
  });
}

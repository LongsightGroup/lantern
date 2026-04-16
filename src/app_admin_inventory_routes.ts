import type { Hono } from '@hono/hono';
import { preflightLocalAppPackageSource } from './authoring/local_app.ts';
import {
  handleReviewDecision,
  renderInventoryError,
  renderPackagesPage,
} from './app_admin_support.ts';
import { createErrorNotice, packageOverviewPath } from './app_notice_support.ts';
import { requireTrimmedFormValue } from './app_request_support.ts';
import { statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import { renderPackageDetailPage } from './admin/package_detail.ts';
import { renderPackageImportPage } from './admin/package_import_page.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import { renderPackageOverviewPage } from './admin/package_overview.ts';
import { renderReferencePackagePage } from './admin/package_reference_page.ts';
import { isReferencePackageId } from './package_review/intake.ts';
import {
  createMemoryPackageSource,
  type MemoryPackageSourceFile,
} from './package_review/package_source.ts';

export function registerAdminInventoryRoutes(app: Hono, services: AppServices): void {
  app.get('/admin/packages', async (context) => {
    try {
      return await renderPackagesPage(context, services);
    } catch (error) {
      return context.html(
        renderPackageIndexPage({
          versions: [],
          notice: createErrorNotice('Package inventory unavailable', error),
        }),
        statusForError(error),
      );
    }
  });

  app.get('/admin/packages/import', (context) => {
    return context.html(renderPackageImportPage());
  });

  app.post('/admin/packages/import', async (context) => {
    try {
      const repository = services.getRepository();
      const formData = await context.req.formData();
      const source = await createUploadedPackageSource(formData);
      const preflight = await preflightLocalAppPackageSource(source);

      if (!preflight.ok || !preflight.validatedPackage) {
        return context.html(
          renderPackageImportPage({
            notice: {
              tone: 'error',
              title: 'Package import blocked',
              detail: 'Resolve the reviewed package findings below and try again.',
            },
            diagnostics: preflight.diagnostics,
          }),
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
        renderPackageImportPage({
          notice: createErrorNotice('Package import blocked', error),
        }),
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
    return context.html(renderReferencePackagePage());
  });

  app.get('/admin/packages/:appId', async (context) => {
    const appId = context.req.param('appId');

    try {
      const repository = services.getRepository();
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: await repository.listPackageVersions(),
            notice: {
              tone: 'error',
              title: 'App not found',
              detail: 'Lantern could not find that app.',
            },
          }),
          404,
        );
      }

      const deployments = await repository.listDeploymentsByApp(appId);

      return context.html(
        renderPackageOverviewPage({
          appId,
          appTitle: history[0]?.title ?? appId,
          history,
          deployments,
        }),
      );
    } catch (error) {
      try {
        const repository = services.getRepository();

        return context.html(
          renderPackageIndexPage({
            versions: await repository.listPackageVersions(),
            notice: createErrorNotice('App details unavailable', error),
          }),
          statusForError(error),
        );
      } catch {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: createErrorNotice('App details unavailable', error),
          }),
          statusForError(error),
        );
      }
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

      const history = await repository.listPackageVersionsByApp(packageVersion.appId);

      return context.html(
        renderPackageDetailPage({
          packageVersion,
          history,
        }),
      );
    } catch (error) {
      return context.html(
        renderPackageIndexPage({
          versions: [],
          notice: createErrorNotice('Version details unavailable', error),
        }),
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

function requireSupportedReferencePackageId(value: FormDataEntryValue | null): string {
  const appId = requireTrimmedFormValue(value, "Choose one of Lantern's shipped reference apps.");

  if (!isReferencePackageId(appId)) {
    throw new Error("Choose one of Lantern's shipped reference apps.");
  }

  return appId;
}

async function createUploadedPackageSource(formData: FormData) {
  return createMemoryPackageSource(await collectUploadedPackageFiles(formData));
}

async function collectUploadedPackageFiles(formData: FormData): Promise<MemoryPackageSourceFile[]> {
  const uploadedFiles = formData.getAll('packageFiles');

  if (uploadedFiles.length === 0) {
    throw new Error('Choose one reviewed package directory.');
  }

  const files = await Promise.all(
    uploadedFiles.map(async (entry) => {
      if (!(entry instanceof File)) {
        throw new TypeError('Choose one reviewed package directory.');
      }

      return {
        relativePath: readUploadedRelativePath(entry),
        bytes: new Uint8Array(await entry.arrayBuffer()),
      };
    }),
  );

  return normalizeUploadedPackageFiles(files);
}

function normalizeUploadedPackageFiles(
  files: MemoryPackageSourceFile[],
): MemoryPackageSourceFile[] {
  const normalizedFiles = files.map((file) => ({
    ...file,
    relativePath: file.relativePath.replaceAll('\\', '/').replace(/^\/+/, ''),
  }));

  if (normalizedFiles.some((file) => file.relativePath === 'manifest.json')) {
    return normalizedFiles;
  }

  const sharedRoot = getSharedUploadRoot(normalizedFiles);

  if (sharedRoot === null) {
    return normalizedFiles;
  }

  if (!normalizedFiles.some((file) => file.relativePath === `${sharedRoot}/manifest.json`)) {
    return normalizedFiles;
  }

  return normalizedFiles.map((file) => ({
    ...file,
    relativePath: file.relativePath.slice(sharedRoot.length + 1),
  }));
}

function getSharedUploadRoot(files: MemoryPackageSourceFile[]): string | null {
  const roots = new Set<string>();

  for (const file of files) {
    const separatorIndex = file.relativePath.indexOf('/');

    if (separatorIndex < 0) {
      return null;
    }

    roots.add(file.relativePath.slice(0, separatorIndex));
  }

  return roots.size === 1 ? ([...roots][0] ?? null) : null;
}

function readUploadedRelativePath(file: File): string {
  const webkitRelativePath =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? null;

  return webkitRelativePath && webkitRelativePath !== '' ? webkitRelativePath : file.name;
}

function statusForPackageImportError(error: unknown): 409 | 500 {
  if (error instanceof Error && error.message.includes('Package source file')) {
    return 409;
  }

  return statusForError(error);
}

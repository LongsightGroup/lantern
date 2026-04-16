import type { Context, Hono } from '@hono/hono';
import { type AuthoringPageFileView, renderAuthoringPage } from './admin/authoring_page.ts';
import { renderPackageDetailPage } from './admin/package_detail.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import { createErrorNotice } from './app_notice_support.ts';
import { statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import { readEnv } from './platform/env.ts';
import { trimLeadingSlash } from './package_review/snapshot_path.ts';
import type {
  AuthoringDraftRecord,
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
} from './package_review/types.ts';
import { launchPreviewRuntimeSession } from './preview/service.ts';
import { buildRuntimeSessionUrl, requireConfiguredRuntimeOrigin } from './runtime_origin.ts';

const textDecoder = new TextDecoder();

type AuthoringPreviewState = {
  packageVersion: PackageVersionRecord;
  draft: AuthoringDraftRecord;
  currentFiles: AuthoringPageFileView[];
  latestPreviewSession: PreviewSessionRecord | null;
  previewEvidence: PreviewEvidenceRecord[];
};

export function registerAdminAuthoringPreviewRoutes(app: Hono, services: AppServices): void {
  app.post('/admin/packages/:appId/versions/:version/authoring/preview', async (context) => {
    const appId = context.req.param('appId');
    const version = context.req.param('version');
    let state: AuthoringPreviewState | null = null;

    try {
      state = await loadAuthoringPreviewState(services, appId, version);

      if (state === null) {
        return renderVersionNotFound(context);
      }

      if (state.draft.files.length === 0) {
        throw new Error('Preview requires at least one saved draft file.');
      }

      const previewPackageVersion = await services.materializeDraftPreviewPackageVersion({
        draft: state.draft,
        packageVersion: state.packageVersion,
        createdAt: new Date().toISOString(),
      });
      const launched = await launchPreviewRuntimeSession({
        repository: services.getRepository(),
        packageVersion: previewPackageVersion,
        artifactStore: services.runtimeArtifactStore,
        previewOrigin: 'adminAuthoringDraft',
      });
      const runtimeOrigin = requireConfiguredRuntimeOrigin(
        readEnv('APP_RUNTIME_ORIGIN', services.env),
      );

      await services.getRepository().markAuthoringDraftPreviewed({
        draftId: state.draft.draftId,
        previewedAt: new Date().toISOString(),
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
      return await renderAuthoringPreviewError(context, services, appId, version, error, state);
    }
  });
}

async function loadAuthoringPreviewState(
  services: AppServices,
  appId: string,
  version: string,
): Promise<AuthoringPreviewState | null> {
  const repository = services.getRepository();
  const packageVersion = await repository.getPackageVersionByAppVersion(appId, version);

  if (!packageVersion) {
    return null;
  }

  const draft = await repository.createAuthoringDraftFromPackageVersion({
    packageVersionId: packageVersion.id,
    draftId: buildAuthoringDraftId(packageVersion.id),
    createdAt: new Date().toISOString(),
  });
  const latestPreviewSession = await repository.getLatestPreviewSessionByPackageVersion(
    packageVersion.id,
    'adminAuthoringDraft',
  );

  return {
    packageVersion,
    draft,
    currentFiles: await loadCurrentDraftFiles(draft, services),
    latestPreviewSession,
    previewEvidence:
      latestPreviewSession === null
        ? []
        : await repository.listPreviewEvidence(latestPreviewSession.sessionId),
  };
}

async function loadCurrentDraftFiles(
  draft: AuthoringDraftRecord,
  services: AppServices,
): Promise<AuthoringPageFileView[]> {
  const savedByPath = new Map(draft.files.map((file) => [file.relativePath, file.contents]));

  return await Promise.all(
    draft.authoringPaths.map(async (path) => {
      const savedContents = savedByPath.get(path);

      if (savedContents !== undefined) {
        return { path, contents: savedContents };
      }

      return {
        path,
        contents: textDecoder.decode(
          await services.runtimeArtifactStore.readBytes(
            draft.baseSnapshotRoot,
            trimLeadingSlash(path),
          ),
        ),
      };
    }),
  );
}

async function renderAuthoringPreviewError(
  context: Context,
  services: AppServices,
  appId: string,
  version: string,
  error: unknown,
  state: AuthoringPreviewState | null = null,
) {
  if (state !== null) {
    return context.html(
      renderAuthoringPage({
        packageVersion: state.packageVersion,
        draft: state.draft,
        currentFiles: state.currentFiles,
        latestPreviewSession: state.latestPreviewSession,
        previewEvidence: state.previewEvidence,
        notice: createErrorNotice('Draft preview unavailable', error),
      }),
      statusForError(error),
    );
  }

  const repository = services.getRepository();
  const packageVersion = await repository.getPackageVersionByAppVersion(appId, version);

  if (!packageVersion) {
    return context.html(
      renderPackageIndexPage({
        versions: [],
        notice: createErrorNotice('Draft preview unavailable', error),
      }),
      statusForError(error),
    );
  }

  const history = await repository.listPackageVersionsByApp(packageVersion.appId);

  return context.html(
    renderPackageDetailPage({
      packageVersion,
      history,
      notice: createErrorNotice('Draft preview unavailable', error),
    }),
    statusForError(error),
  );
}

function renderVersionNotFound(context: Context) {
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

function buildAuthoringDraftId(packageVersionId: number): string {
  return `authoring-draft-${packageVersionId}`;
}

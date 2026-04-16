import type { Context, Hono } from '@hono/hono';
import { type AuthoringGeneratedDraftView, renderAuthoringPage } from './admin/authoring_page.ts';
import { renderPackageDetailPage } from './admin/package_detail.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import { createErrorNotice } from './app_notice_support.ts';
import { normalizeOptionalString, requireTrimmedFormValue } from './app_request_support.ts';
import { statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import type { AuthoringDraftFileInput } from './authoring/ai_writer.ts';
import { buildDraftDiff } from './authoring/draft_diff.ts';
import { normalizeAuthoringDraftPath } from './package_review/repository_authoring.ts';
import { trimLeadingSlash } from './package_review/snapshot_path.ts';
import type {
  AuthoringDraftRecord,
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
} from './package_review/types.ts';

const AUTHORING_SAVED_NOTICE = {
  tone: 'success' as const,
  title: 'Draft saved',
  detail: 'Lantern saved the generated authoring files into this draft record.',
};

const textDecoder = new TextDecoder();

type AuthoringRouteState = {
  packageVersion: PackageVersionRecord;
  draft: AuthoringDraftRecord;
  currentFiles: AuthoringDraftFileInput[];
  latestPreviewSession: PreviewSessionRecord | null;
  previewEvidence: PreviewEvidenceRecord[];
};

export function registerAdminAuthoringRoutes(app: Hono, services: AppServices): void {
  app.get('/admin/packages/:appId/versions/:version/authoring', async (context) => {
    const appId = context.req.param('appId');
    const version = context.req.param('version');

    try {
      const state = await loadAuthoringRouteState(services, appId, version);

      if (state === null) {
        return renderVersionNotFound(context);
      }

      const saved = new URL(context.req.url).searchParams.get('saved') === '1';

      return context.html(
        renderAuthoringPage({
          packageVersion: state.packageVersion,
          draft: state.draft,
          currentFiles: state.currentFiles,
          latestPreviewSession: state.latestPreviewSession,
          previewEvidence: state.previewEvidence,
          notice: saved ? AUTHORING_SAVED_NOTICE : null,
        }),
      );
    } catch (error) {
      return await renderAuthoringError(context, services, appId, version, error);
    }
  });

  app.post('/admin/packages/:appId/versions/:version/authoring/generate', async (context) => {
    const appId = context.req.param('appId');
    const version = context.req.param('version');
    let state: AuthoringRouteState | null = null;
    let generatedDraft: AuthoringGeneratedDraftView | null = null;

    try {
      state = await loadAuthoringRouteState(services, appId, version);

      if (state === null) {
        return renderVersionNotFound(context);
      }

      const formData = await context.req.formData();
      const prompt = requireTrimmedFormValue(
        formData.get('prompt'),
        'Enter a prompt before generating a draft.',
      );
      const generated = await services.authoringAiWriter.generate({
        appId: state.packageVersion.appId,
        packageVersion: state.packageVersion.version,
        prompt,
        currentFiles: state.currentFiles,
        referenceExamples: await services.loadAuthoringReferenceExamples(),
      });
      const generatedFiles = normalizeGeneratedFiles(
        generated.files,
        state.draft.authoringPaths,
        'Generated authoring file',
      );

      generatedDraft = {
        prompt,
        notes: [...generated.notes],
        files: generatedFiles,
        diffs: buildDraftDiff({
          currentFiles: state.currentFiles,
          generatedFiles,
        }),
      };

      return context.html(
        renderAuthoringPage({
          packageVersion: state.packageVersion,
          draft: state.draft,
          currentFiles: state.currentFiles,
          latestPreviewSession: state.latestPreviewSession,
          previewEvidence: state.previewEvidence,
          generatedDraft,
        }),
      );
    } catch (error) {
      return await renderAuthoringError(
        context,
        services,
        appId,
        version,
        error,
        state,
        generatedDraft,
      );
    }
  });

  app.post('/admin/packages/:appId/versions/:version/authoring/save', async (context) => {
    const appId = context.req.param('appId');
    const version = context.req.param('version');
    let state: AuthoringRouteState | null = null;
    let generatedDraft: AuthoringGeneratedDraftView | null = null;

    try {
      state = await loadAuthoringRouteState(services, appId, version);

      if (state === null) {
        return renderVersionNotFound(context);
      }

      const formData = await context.req.formData();
      const prompt = normalizeOptionalString(
        typeof formData.get('prompt') === 'string' ? formData.get('prompt') : null,
      );
      const notes = readRepeatedFormStrings(
        formData.getAll('generationNote'),
        'Generation notes must be strings.',
      );
      const generatedFiles = parseGeneratedFiles(formData, state.draft.authoringPaths);

      generatedDraft = {
        prompt: prompt ?? '',
        notes,
        files: generatedFiles,
        diffs: buildDraftDiff({
          currentFiles: state.currentFiles,
          generatedFiles,
        }),
      };

      await services.getRepository().saveAuthoringDraftFiles({
        draftId: state.draft.draftId,
        files: generatedFiles.map((file) => ({
          relativePath: file.path,
          contents: file.contents,
        })),
        latestPromptText: prompt,
        latestGenerationNotes: notes,
        savedSource: 'ai',
        updatedAt: new Date().toISOString(),
      });

      return context.redirect(
        `/admin/packages/${appId}/versions/${version}/authoring?saved=1`,
        303,
      );
    } catch (error) {
      return await renderAuthoringError(
        context,
        services,
        appId,
        version,
        error,
        state,
        generatedDraft,
      );
    }
  });
}

async function loadAuthoringRouteState(
  services: AppServices,
  appId: string,
  version: string,
): Promise<AuthoringRouteState | null> {
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

  return {
    packageVersion,
    draft,
    currentFiles: await loadCurrentDraftFiles(draft, services),
    ...(await loadAuthoringPreviewLog(repository, packageVersion.id)),
  };
}

async function loadCurrentDraftFiles(
  draft: AuthoringDraftRecord,
  services: AppServices,
): Promise<AuthoringDraftFileInput[]> {
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

function parseGeneratedFiles(
  formData: FormData,
  authoringPaths: string[],
): AuthoringDraftFileInput[] {
  const paths = readRepeatedFormStrings(
    formData.getAll('generatedPath'),
    'Generated draft files are required before saving.',
  );
  const contents = readRepeatedFormStrings(
    formData.getAll('generatedContents'),
    'Generated draft files are required before saving.',
  );

  if (paths.length === 0 || paths.length !== contents.length) {
    throw new Error('Generated draft files are required before saving.');
  }

  return normalizeGeneratedFiles(
    paths.map((path, index) => ({
      path,
      contents: contents[index] ?? '',
    })),
    authoringPaths,
    'Generated authoring file',
  );
}

function normalizeGeneratedFiles(
  files: AuthoringDraftFileInput[],
  authoringPaths: string[],
  messagePrefix: string,
): AuthoringDraftFileInput[] {
  const allowedPaths = new Set(authoringPaths);
  const normalizedFiles = new Map<string, AuthoringDraftFileInput>();

  for (const file of files) {
    const path = normalizeAuthoringDraftPath(file.path);

    if (!allowedPaths.has(path)) {
      throw new Error(`${messagePrefix} ${path} is outside the approved authoring file set.`);
    }

    normalizedFiles.set(path, { path, contents: file.contents });
  }

  return [...normalizedFiles.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function readRepeatedFormStrings(values: FormDataEntryValue[], message: string): string[] {
  return values.map((value) => {
    if (typeof value !== 'string') {
      throw new TypeError(message);
    }

    return value;
  });
}

async function loadAuthoringPreviewLog(
  repository: ReturnType<AppServices['getRepository']>,
  packageVersionId: number,
): Promise<{
  latestPreviewSession: PreviewSessionRecord | null;
  previewEvidence: PreviewEvidenceRecord[];
}> {
  const latestPreviewSession = await repository.getLatestPreviewSessionByPackageVersion(
    packageVersionId,
    'adminAuthoringDraft',
  );

  if (latestPreviewSession === null) {
    return {
      latestPreviewSession: null,
      previewEvidence: [],
    };
  }

  return {
    latestPreviewSession,
    previewEvidence: await repository.listPreviewEvidence(latestPreviewSession.sessionId),
  };
}

async function renderAuthoringError(
  context: Context,
  services: AppServices,
  appId: string,
  version: string,
  error: unknown,
  state: AuthoringRouteState | null = null,
  generatedDraft: AuthoringGeneratedDraftView | null = null,
) {
  if (state !== null) {
    return context.html(
      renderAuthoringPage({
        packageVersion: state.packageVersion,
        draft: state.draft,
        currentFiles: state.currentFiles,
        latestPreviewSession: state.latestPreviewSession,
        previewEvidence: state.previewEvidence,
        generatedDraft,
        notice: createErrorNotice('Authoring draft unavailable', error),
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
        notice: createErrorNotice('Authoring draft unavailable', error),
      }),
      statusForError(error),
    );
  }

  const history = await repository.listPackageVersionsByApp(packageVersion.appId);

  return context.html(
    renderPackageDetailPage({
      packageVersion,
      history,
      notice: createErrorNotice('Authoring draft unavailable', error),
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

import { assertEquals } from '@std/assert';
import type { AppWriterWorkspaceRunner } from './workspace_runner.ts';
import { buildInitializedAppWriterWorkspace } from './workspace_initialization.ts';
import type {
  AppGenerationPlanningResult,
  AppGenerationValidationFinding,
  AppPackageFileGenerationResult,
  AppPackageGenerationResult,
  AppPackagePreviewer,
  AppPackagePreviewResult,
} from './types.ts';
import type { PackageSnapshotStore } from '../package_review/snapshot_store.ts';
import { buildValidSimpleActivityFiles } from '../test_helpers/app_writer_generated_package.ts';
import { getTestToolPrivateJwkEnvValue } from '../test_helpers/lti.ts';

export function buildGenerationResult(
  overrides: Partial<AppPackageGenerationResult> = {},
): AppPackageGenerationResult {
  return {
    normalizedRequest: {
      learningGoal: 'Practice phonics patterns.',
      audience: 'Grade 1',
      contentSummary: 'One hundred phonics words.',
      requestedActivity: 'matching game',
      constraints: [],
      missingInformation: [],
      safeToGenerate: true,
    },
    appPlan: {
      appId: 'phonics-match',
      title: 'Phonics Match',
      description: 'A small matching game for phonics practice.',
      learningGoal: 'Practice phonics patterns.',
      audience: 'Grade 1',
      activityType: 'matching',
      learnerFlow: ['Read the sound.', 'Pick the matching word.', 'Complete all cards.'],
      contentModel: {
        wordCount: 100,
      },
      capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
      grading: {
        mode: 'completion',
        maxScore: 100,
        scoringSummary: 'Completion credit after all cards are answered.',
      },
      attemptEvents: [
        {
          when: 'after each answer',
          eventType: 'answer',
          questionIdPattern: 'word-*',
        },
      ],
      previewTests: ['renders the title'],
      accessibilityNotes: ['Use buttons for answer choices.'],
      riskNotes: [],
    },
    selectedStarterId: 'simple-activity',
    files: buildValidSimpleActivityFiles(),
    progressUpdates: [
      {
        stage: 'planning_app',
        message: 'Planning a phonics activity with simple learner progress.',
      },
    ],
    notes: ['Generated from fake app writer workspace harness.'],
    validationFindings: [],
    ...overrides,
  };
}

export function createStagedAppWriterWorkspaceRunner(): AppWriterWorkspaceRunner {
  return {
    initialize(input) {
      return Promise.resolve(buildInitializedAppWriterWorkspace(input));
    },
    plan(_input) {
      const generation = buildGenerationResult();
      const planning: AppGenerationPlanningResult = {
        normalizedRequest: generation.normalizedRequest,
        appPlan: generation.appPlan,
        selectedStarterId: generation.selectedStarterId,
        progressUpdates: [
          {
            stage: 'planning_app',
            message: 'Planning the Lantern app before editing scaffold files.',
          },
        ],
        notes: ['Planned from staged workspace harness.'],
        modelRequestMetadata: [
          {
            provider: 'cloudflare',
            model: '@cf/test/model',
            requestId: 'request-plan',
            durationMs: 20,
            responseCharacters: 1024,
            stage: 'author',
            attempt: 1,
            outcome: 'succeeded',
            errorCode: null,
          },
        ],
      };

      return Promise.resolve(planning);
    },
    author(input) {
      const fileGeneration: AppPackageFileGenerationResult = {
        files: buildValidSimpleActivityFiles(),
        progressUpdates: [
          {
            stage: 'building_package',
            message: 'Editing the Lantern starter workspace.',
          },
        ],
        notes: ['Wrote files.'],
        validationFindings: [],
        modelRequestMetadata: [
          {
            provider: 'cloudflare',
            model: '@cf/test/model',
            requestId: 'request-files',
            durationMs: 40,
            responseCharacters: 4096,
            stage: 'author',
            attempt: 1,
            outcome: 'succeeded',
            errorCode: null,
          },
        ],
      };

      assertEquals(input.planning.appPlan.appId, 'phonics-match');

      return Promise.resolve(fileGeneration);
    },
    repair(_input) {
      return Promise.resolve(buildGenerationResult());
    },
  };
}

export function createRevisionAssertingWorkspaceRunner(): AppWriterWorkspaceRunner {
  return {
    initialize(input) {
      return Promise.resolve(buildInitializedAppWriterWorkspace(input));
    },
    plan(input) {
      const generation = buildGenerationResult({
        notes: ['Planned revision from source package snapshot.'],
      });
      const revision = input.selectedContext.revision as
        | {
          targetVersion?: unknown;
        }
        | undefined;

      assertEquals(input.requestedAppId, 'phonics-match');
      assertEquals(revision?.targetVersion, '0.2.0');

      return Promise.resolve({
        normalizedRequest: generation.normalizedRequest,
        appPlan: generation.appPlan,
        selectedStarterId: generation.selectedStarterId,
        progressUpdates: [
          {
            stage: 'planning_app',
            message: 'Planning a revision from the previous package snapshot.',
          },
        ],
        notes: ['Planned revision from source package snapshot.'],
      });
    },
    author(input) {
      const manifest = input.initializedWorkspace.files.find(
        (file) => file.path === 'manifest.json',
      );
      const css = input.initializedWorkspace.files.find((file) => file.path === 'dist/app.css');

      assertEquals(JSON.parse(manifest?.contents ?? '{}').version, '0.2.0');
      assertEquals(css?.contents.includes('font-family'), true);

      return Promise.resolve({
        files: input.initializedWorkspace.files.map((file) =>
          file.path === 'dist/app.js'
            ? {
              ...file,
              contents: `${file.contents}\nconsole.log("revision summary ready");\n`,
            }
            : file
        ),
        progressUpdates: [
          {
            stage: 'building_package',
            message: 'Edited existing package snapshot files.',
          },
        ],
        notes: ['Revised existing package snapshot.'],
        validationFindings: [],
      });
    },
    repair(_input) {
      return Promise.reject(new Error('Revision test should not repair.'));
    },
  };
}

export function createMemoryPackageSnapshotStore(
  roots: Record<string, AppPackageGenerationResult['files']>,
): PackageSnapshotStore {
  const filesByRoot = new Map(
    Object.entries(roots).map(([root, files]) => [
      root,
      new Map(files.map((file) => [file.path, new TextEncoder().encode(file.contents)])),
    ]),
  );

  return {
    readBytes(snapshotRoot, relativePath) {
      const file = filesByRoot.get(snapshotRoot)?.get(relativePath);

      if (file === undefined) {
        return Promise.reject(
          new Error(`Snapshot file ${snapshotRoot}/${relativePath} was not found.`),
        );
      }

      return Promise.resolve(file.slice());
    },
    writeBytes(snapshotRoot, relativePath, bytes) {
      let files = filesByRoot.get(snapshotRoot);

      if (files === undefined) {
        files = new Map();
        filesByRoot.set(snapshotRoot, files);
      }

      files.set(relativePath, bytes.slice());
      return Promise.resolve();
    },
    fileExists(snapshotRoot, relativePath) {
      return Promise.resolve(filesByRoot.get(snapshotRoot)?.has(relativePath) ?? false);
    },
    listFiles(snapshotRoot) {
      return Promise.resolve([...(filesByRoot.get(snapshotRoot)?.keys() ?? [])].sort());
    },
  };
}

export function buildTypeScriptAuthoringPackageFiles(
  input: {
    appSource?: string;
  } = {},
): AppPackageGenerationResult['files'] {
  return [
    ...buildValidSimpleActivityFiles().filter((file) => file.path !== 'dist/app.js'),
    {
      path: 'source/content_model.ts',
      contents: 'interface ActivityContent {\n  title: string;\n  words: string[];\n}\n',
    },
    {
      path: 'source/app.ts',
      contents: input.appSource ??
        'async function start() {\n  const gateway = window.GatewayApp;\n  if (!gateway) throw new Error("Lantern preview injects window.GatewayApp.");\n  const content = await gateway.getActivityContent<ActivityContent>();\n  document.body.dataset.title = content.title;\n  await gateway.emitAttemptEvent({ type: "complete", timestamp: new Date().toISOString() });\n  await gateway.finalizeAttempt({ completionState: "completed" });\n}\nvoid start();\n',
    },
  ];
}

export const TEST_RUNTIME_CONTRACT_ENV = {
  get(name: string): string | undefined {
    return name === 'LTI_TOOL_PRIVATE_JWK' ? getTestToolPrivateJwkEnvValue() : undefined;
  },
};

export function createSequencePreviewer(
  results: AppGenerationValidationFinding[][],
): AppPackagePreviewer {
  const remainingResults = results.map((result) => buildPreviewResult(result));

  return {
    preview(_input) {
      const nextResult = remainingResults.shift();

      if (nextResult === undefined) {
        throw new Error('Previewer had no queued result.');
      }

      return Promise.resolve(nextResult);
    },
  };
}

export function buildPreviewResult(
  validationFindings: AppGenerationValidationFinding[],
): AppPackagePreviewResult {
  return {
    validationFindings: structuredClone(validationFindings),
    assertionCount: validationFindings.length === 0 ? 1 : validationFindings.length,
    passedAssertionCount: validationFindings.length === 0 ? 1 : 0,
    runtimeLog: [
      {
        level: 'info',
        message: 'preview content read',
        detail: {},
      },
    ],
    summary: validationFindings.length === 0
      ? 'Passed 1/1 preview assertions.'
      : `Failed ${validationFindings.length}/${validationFindings.length} preview assertions.`,
  };
}

export function createClock(times: string[]): () => string {
  const remaining = [...times];
  let lastTimestamp = times.at(-1) ?? '2026-05-14T12:00:00.000Z';

  return () => {
    const next = remaining.shift();

    if (next !== undefined) {
      lastTimestamp = next;
      return next;
    }

    lastTimestamp = new Date(Date.parse(lastTimestamp) + 1000).toISOString();
    return lastTimestamp;
  };
}

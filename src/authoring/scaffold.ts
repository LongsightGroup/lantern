import type { AppManifest } from '../package_review/manifest_contract.ts';
import { joinSnapshotPath } from '../package_review/snapshot_path.ts';

const OUTPUT_ROOT_OUTSIDE_MESSAGE =
  'Scaffold output files must stay inside the chosen package root.';
const DEFAULT_OWNER_ID = 'author_123';
const APP_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ScaffoldStarterId = 'simple-activity' | 'browser-autograder';

export interface ScaffoldStarterSummary {
  id: ScaffoldStarterId;
  label: string;
  description: string;
}

export interface ScaffoldPackageOptions {
  starter: ScaffoldStarterId;
  outputRoot: string;
  appId: string;
  title: string;
  ownerId?: string;
}

export interface ScaffoldPackageResult {
  starter: ScaffoldStarterSummary;
  outputRoot: string;
}

interface ScaffoldRewriteContext {
  outputRoot: string;
  appId: string;
  title: string;
  ownerId: string;
}

interface ScaffoldStarterDefinition extends ScaffoldStarterSummary {
  sourceRoot: string;
  rewrite(context: ScaffoldRewriteContext): Promise<void>;
}

const STARTERS: ReadonlyArray<ScaffoldStarterDefinition> = [
  {
    id: 'simple-activity',
    label: 'Simple Activity',
    description: 'Minimal completion-graded learner activity starter.',
    sourceRoot: resolveStarterSourceRoot('examples/starters/simple-activity'),
    rewrite: rewriteSimpleActivityStarter,
  },
  {
    id: 'browser-autograder',
    label: 'Browser Autograder',
    description: 'Minimal browser-graded activity starter with reviewed specs.',
    sourceRoot: resolveStarterSourceRoot('examples/apps/template'),
    rewrite: rewriteBrowserAutograderStarter,
  },
];

export function listScaffoldStarters(): readonly ScaffoldStarterSummary[] {
  return STARTERS.map((starter) => ({
    id: starter.id,
    label: starter.label,
    description: starter.description,
  }));
}

export async function scaffoldLocalAppPackage(
  input: ScaffoldPackageOptions,
): Promise<ScaffoldPackageResult> {
  const starter = requireStarter(input.starter);
  const outputRoot = resolveOutputRoot(input.outputRoot);
  const appId = requireAppId(input.appId);
  const title = requireNonEmptyString(input.title, 'Package title is required.');
  const ownerId = requireNonEmptyString(input.ownerId ?? DEFAULT_OWNER_ID, 'Owner ID is required.');

  await prepareOutputRoot(outputRoot);
  await copyDirectory(starter.sourceRoot, outputRoot);
  await starter.rewrite({
    outputRoot,
    appId,
    title,
    ownerId,
  });

  return {
    starter: {
      id: starter.id,
      label: starter.label,
      description: starter.description,
    },
    outputRoot,
  };
}

function requireStarter(starterId: ScaffoldStarterId): ScaffoldStarterDefinition {
  const starter = STARTERS.find((candidate) => candidate.id === starterId);

  if (!starter) {
    throw new Error(`Unsupported starter: ${starterId}`);
  }

  return starter;
}

function requireAppId(value: string): string {
  const appId = requireNonEmptyString(value, 'App ID is required.');

  if (!APP_ID_PATTERN.test(appId)) {
    throw new Error('App ID must use lowercase letters, numbers, and hyphens only.');
  }

  return appId;
}

function requireNonEmptyString(value: string, message: string): string {
  const trimmed = value.trim();

  if (trimmed === '') {
    throw new Error(message);
  }

  return trimmed;
}

function resolveOutputRoot(value: string): string {
  const trimmed = requireNonEmptyString(value, 'Output path is required.');
  const absolute = isAbsolutePath(trimmed)
    ? trimmed
    : `${Deno.cwd().replace(/\/+$/, '')}/${trimmed}`;

  return absolute.replace(/\/+$/, '');
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

async function prepareOutputRoot(outputRoot: string): Promise<void> {
  try {
    const stat = await Deno.stat(outputRoot);

    if (!stat.isDirectory) {
      throw new Error(`Scaffold output path ${outputRoot} must be a directory.`);
    }

    for await (const _entry of Deno.readDir(outputRoot)) {
      throw new Error(`Scaffold output path ${outputRoot} must not already contain files.`);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      await Deno.mkdir(outputRoot, { recursive: true });
      return;
    }

    throw error;
  }
}

async function copyDirectory(sourceRoot: string, targetRoot: string): Promise<void> {
  for await (const entry of Deno.readDir(sourceRoot)) {
    const sourcePath = `${sourceRoot}/${entry.name}`;
    const targetPath = joinSnapshotPath(targetRoot, entry.name, OUTPUT_ROOT_OUTSIDE_MESSAGE);

    if (entry.isDirectory) {
      await Deno.mkdir(targetPath, { recursive: true });
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile) {
      await Deno.copyFile(sourcePath, targetPath);
    }
  }
}

async function rewriteSimpleActivityStarter(context: ScaffoldRewriteContext): Promise<void> {
  await rewriteStarterIdentityFiles(context);
}

async function rewriteBrowserAutograderStarter(context: ScaffoldRewriteContext): Promise<void> {
  await rewriteStarterIdentityFiles(context);
  await rewriteTextFile(
    context.outputRoot,
    'dist/index.html',
    (source) => source.replaceAll('Template App', context.title),
  );
  await rewriteTextFile(
    context.outputRoot,
    'dist/app.js',
    (source) => source.replaceAll('"Template App"', JSON.stringify(context.title)),
  );
  await rewriteTextFile(
    context.outputRoot,
    'grading/specs/checks.spec.js',
    (source) => source.replaceAll("'Template App'", JSON.stringify(context.title)),
  );
}

async function rewriteStarterIdentityFiles(context: ScaffoldRewriteContext): Promise<void> {
  await rewriteManifestFile(context.outputRoot, (manifest) => ({
    ...manifest,
    app_id: context.appId,
    title: context.title,
    owner: {
      type: 'user',
      id: context.ownerId,
    },
  }));
  await rewriteJsonFile<Record<string, unknown>>(
    context.outputRoot,
    'content/activity.json',
    (content) => ({
      ...content,
      title: context.title,
    }),
  );
  await rewriteJsonFile<Record<string, unknown>>(
    context.outputRoot,
    'preview/fixtures.json',
    (fixture) => {
      const launch = readRecord(fixture.launch, 'Preview fixtures launch must be an object.');

      return {
        ...fixture,
        launch: {
          ...launch,
          activity_id: context.appId,
        },
        attempt_id: buildPreviewAttemptId(context.appId),
      };
    },
  );
  await rewriteJsonFile<Array<Record<string, unknown>>>(
    context.outputRoot,
    'preview/tests.json',
    (tests) =>
      tests.map((test, index) => {
        if (index !== 0) {
          return test;
        }

        const assertion = readRecord(test.assert, 'Preview test assert must be an object.');

        return {
          ...test,
          assert: {
            ...assertion,
            text: context.title,
          },
        };
      }),
  );
}

async function rewriteManifestFile(
  outputRoot: string,
  mutate: (manifest: AppManifest) => AppManifest,
): Promise<void> {
  await rewriteJsonFile<AppManifest>(outputRoot, 'manifest.json', mutate);
}

async function rewriteJsonFile<T>(
  outputRoot: string,
  relativePath: string,
  mutate: (value: T) => T,
): Promise<void> {
  const absolutePath = joinSnapshotPath(outputRoot, relativePath, OUTPUT_ROOT_OUTSIDE_MESSAGE);
  const value = readJsonFile<T>(await Deno.readTextFile(absolutePath));

  await Deno.writeTextFile(absolutePath, `${JSON.stringify(mutate(value), null, 2)}\n`);
}

async function rewriteTextFile(
  outputRoot: string,
  relativePath: string,
  mutate: (source: string) => string,
): Promise<void> {
  const absolutePath = joinSnapshotPath(outputRoot, relativePath, OUTPUT_ROOT_OUTSIDE_MESSAGE);

  await Deno.writeTextFile(absolutePath, mutate(await Deno.readTextFile(absolutePath)));
}

function readJsonFile<T>(text: string): T {
  return JSON.parse(text) as T;
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function buildPreviewAttemptId(appId: string): string {
  return `attempt_${appId.replaceAll('-', '_')}_demo`;
}

function resolveStarterSourceRoot(relativePath: string): string {
  return decodeURIComponent(new URL(`../../${relativePath}`, import.meta.url).pathname).replace(
    /\/$/,
    '',
  );
}

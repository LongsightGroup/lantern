import {
  getReferencePackageBucketSourceRoot,
  getReferencePackageSourceRoot,
  isReferencePackageId,
  listReferencePackageIds,
  type ReferencePackageId,
} from '../src/package_review/intake.ts';

export type ReferenceSyncMode = 'remote' | 'local';

export interface ReferenceSyncArgs {
  bucket: string;
  appIds: ReferencePackageId[];
  mode: ReferenceSyncMode;
  configPath: string | null;
  envName: string | null;
  persistTo: string | null;
  dryRun: boolean;
}

export interface ReferencePackageSourceUpload {
  appId: ReferencePackageId;
  relativePath: string;
  sourcePath: string;
  objectKey: string;
}

export interface ReferenceSyncSummary {
  bucket: string;
  appIds: ReferencePackageId[];
  mode: ReferenceSyncMode;
  dryRun: boolean;
  uploads: ReferencePackageSourceUpload[];
}

interface ReferenceSyncSourceOptions {
  resolveSourceRoot?: (appId: ReferencePackageId) => string;
  resolveBucketRoot?: (appId: ReferencePackageId) => string;
}

interface ReferenceSyncOptions extends ReferenceSyncSourceOptions {
  runWranglerCommand?: WranglerCommandRunner;
}

export type WranglerCommandRunner = (args: string[]) => Promise<void>;

export function readArgs(args: string[]): ReferenceSyncArgs {
  let bucket: string | null = null;
  const appIds: ReferencePackageId[] = [];
  let mode: ReferenceSyncMode = 'remote';
  let configPath: string | null = null;
  let envName: string | null = null;
  let persistTo: string | null = null;
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--local') {
      mode = 'local';
      continue;
    }

    if (arg === '--remote') {
      mode = 'remote';
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg.startsWith('--bucket=')) {
      bucket = arg.slice('--bucket='.length).trim();
      continue;
    }

    if (arg.startsWith('--app-id=')) {
      const appId = arg.slice('--app-id='.length);

      if (!isReferencePackageId(appId)) {
        throw new Error(`Unsupported reference app id: ${appId}\n\n${buildUsageMessage()}`);
      }

      if (!appIds.includes(appId)) {
        appIds.push(appId);
      }

      continue;
    }

    if (arg.startsWith('--config=')) {
      configPath = arg.slice('--config='.length);
      continue;
    }

    if (arg.startsWith('--env=')) {
      envName = arg.slice('--env='.length);
      continue;
    }

    if (arg.startsWith('--persist-to=')) {
      persistTo = arg.slice('--persist-to='.length);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}\n\n${buildUsageMessage()}`);
  }

  if (bucket === null || bucket === '') {
    throw new Error(buildUsageMessage());
  }

  if (bucket.includes('/')) {
    throw new Error('Bucket name must not contain "/".');
  }

  if (persistTo !== null && mode !== 'local') {
    throw new Error('--persist-to requires --local.');
  }

  return {
    bucket,
    appIds: appIds.length > 0 ? appIds : listReferencePackageIds(),
    mode,
    configPath,
    envName,
    persistTo,
    dryRun,
  };
}

export async function listReferencePackageSourceUploads(
  appIds: ReferencePackageId[],
  options: ReferenceSyncSourceOptions = {},
): Promise<ReferencePackageSourceUpload[]> {
  const resolveSourceRoot = options.resolveSourceRoot ?? getReferencePackageSourceRoot;
  const resolveBucketRoot = options.resolveBucketRoot ?? getReferencePackageBucketSourceRoot;
  const uploads: ReferencePackageSourceUpload[] = [];

  for (const appId of appIds) {
    const sourceRoot = resolveSourceRoot(appId);
    const bucketRoot = resolveBucketRoot(appId);
    const relativePaths = await listDirectoryFiles(sourceRoot);

    for (const relativePath of relativePaths) {
      uploads.push({
        appId,
        relativePath,
        sourcePath: joinLocalPath(sourceRoot, relativePath),
        objectKey: `${bucketRoot}/${relativePath}`,
      });
    }
  }

  return uploads;
}

export function buildWranglerR2PutArgs(
  input: ReferenceSyncArgs,
  upload: ReferencePackageSourceUpload,
): string[] {
  return [
    'wrangler',
    ...(input.configPath === null ? [] : ['--config', input.configPath]),
    ...(input.envName === null ? [] : ['--env', input.envName]),
    'r2',
    'object',
    'put',
    `${input.bucket}/${upload.objectKey}`,
    '--file',
    upload.sourcePath,
    input.mode === 'local' ? '--local' : '--remote',
    ...(input.persistTo === null ? [] : ['--persist-to', input.persistTo]),
    '--force',
  ];
}

export async function syncReferencePackageSources(
  input: ReferenceSyncArgs,
  options: ReferenceSyncOptions = {},
): Promise<ReferenceSyncSummary> {
  const uploads = await listReferencePackageSourceUploads(input.appIds, options);

  if (!input.dryRun) {
    const runWranglerCommand = options.runWranglerCommand ?? runWranglerCommandWithNpx;

    for (const upload of uploads) {
      await runWranglerCommand(buildWranglerR2PutArgs(input, upload));
    }
  }

  return {
    bucket: input.bucket,
    appIds: input.appIds,
    mode: input.mode,
    dryRun: input.dryRun,
    uploads,
  };
}

function buildUsageMessage(): string {
  return [
    'Usage: deno task reference:sync --bucket=<bucket-name> [--app-id=<id>] [--remote|--local] [--persist-to=<dir>] [--config=<path>] [--env=<name>] [--dry-run]',
    '',
    'Curated reference app ids:',
    ...listReferencePackageIds().map((appId) => `- ${appId}`),
  ].join('\n');
}

async function listDirectoryFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  await collectDirectoryFiles(root, '', files);
  files.sort();

  return files;
}

async function collectDirectoryFiles(
  root: string,
  relativePrefix: string,
  files: string[],
): Promise<void> {
  const entries: Deno.DirEntry[] = [];

  for await (const entry of Deno.readDir(root)) {
    entries.push(entry);
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const relativePath = relativePrefix === '' ? entry.name : `${relativePrefix}/${entry.name}`;
    const absolutePath = joinLocalPath(root, entry.name);

    if (entry.isDirectory) {
      await collectDirectoryFiles(absolutePath, relativePath, files);
      continue;
    }

    if (entry.isFile) {
      files.push(relativePath);
    }
  }
}

function joinLocalPath(root: string, relativePath: string): string {
  return `${root.replaceAll(/\/+$/g, '')}/${relativePath.replaceAll(/^\/+/g, '')}`;
}

async function runWranglerCommandWithNpx(args: string[]): Promise<void> {
  const command = new Deno.Command('npx', {
    args,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const result = await command.spawn().status;

  if (!result.success) {
    throw new Error(`Wrangler command failed: npx ${args.join(' ')}`);
  }
}

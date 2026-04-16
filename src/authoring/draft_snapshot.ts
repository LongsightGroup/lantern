import type { AuthoringDraftRecord, PackageVersionRecord } from '../package_review/types.ts';
import { joinSnapshotPath, trimLeadingSlash } from '../package_review/snapshot_path.ts';

const DRAFT_SNAPSHOT_OUTSIDE_MESSAGE =
  'Draft snapshot files must stay inside the materialized root.';

export async function materializeDraftPreviewPackageVersion(input: {
  draft: AuthoringDraftRecord;
  packageVersion: PackageVersionRecord;
  createdAt: string;
}): Promise<PackageVersionRecord> {
  const snapshotRoot = buildAuthoringDraftSnapshotRoot(input.draft.draftId, input.createdAt);

  await copyDirectory(input.packageVersion.artifact.snapshotRoot, snapshotRoot);

  for (const file of input.draft.files) {
    const absolutePath = joinSnapshotPath(
      snapshotRoot,
      trimLeadingSlash(file.relativePath),
      DRAFT_SNAPSHOT_OUTSIDE_MESSAGE,
    );

    await Deno.mkdir(parentDirectory(absolutePath), { recursive: true });
    await Deno.writeTextFile(absolutePath, file.contents);
  }

  return {
    ...input.packageVersion,
    artifact: {
      snapshotRoot,
      manifestPath: joinSnapshotPath(snapshotRoot, 'manifest.json', DRAFT_SNAPSHOT_OUTSIDE_MESSAGE),
      entrypointPath: joinSnapshotPath(
        snapshotRoot,
        trimLeadingSlash(input.packageVersion.entrypoint),
        DRAFT_SNAPSHOT_OUTSIDE_MESSAGE,
      ),
      digest: `sha256:authoring-draft-${input.draft.draftId}-${formatSnapshotTimestamp(
        input.createdAt,
      )}`,
    },
  };
}

export function buildAuthoringDraftSnapshotRoot(draftId: string, createdAt: string): string {
  return `var/authoring-drafts/${draftId}/snapshots/${formatSnapshotTimestamp(createdAt)}`;
}

function formatSnapshotTimestamp(createdAt: string): string {
  const timestamp = new Date(createdAt);

  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError(`Draft snapshot time ${createdAt} is not a valid timestamp.`);
  }

  return timestamp.toISOString().replaceAll(/[-:.]/g, '');
}

async function copyDirectory(sourceRoot: string, targetRoot: string): Promise<void> {
  await Deno.mkdir(targetRoot, { recursive: true });

  for await (const entry of Deno.readDir(sourceRoot)) {
    const sourcePath = `${sourceRoot}/${entry.name}`;
    const targetPath = `${targetRoot}/${entry.name}`;

    if (entry.isDirectory) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile) {
      await Deno.mkdir(parentDirectory(targetPath), { recursive: true });
      await Deno.copyFile(sourcePath, targetPath);
    }
  }
}

function parentDirectory(path: string): string {
  const separatorIndex = path.lastIndexOf('/');

  return separatorIndex < 0 ? '.' : path.slice(0, separatorIndex);
}

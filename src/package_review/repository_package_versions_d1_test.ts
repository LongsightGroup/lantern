import { assertEquals, assertRejects } from '@std/assert';
import type { D1Database, D1Parameter, D1PreparedStatement, D1Result } from '../db/d1.ts';
import {
  buildAccessibilityReview,
  buildImportedPackageVersion,
} from '../test_helpers/package_review.ts';
import { createD1PackageVersionRepositoryMethods } from './repository_package_versions_d1.ts';
import type { PackageVersionRecord } from './types.ts';

Deno.test('D1 package version repository registers and refetches a package version', async () => {
  const imported = buildImportedPackageVersion();
  const db = createRecordingD1Database([
    toD1PackageVersionRow(buildPackageVersionRecordFromImport(imported)),
  ]);
  const repository = createD1PackageVersionRepositoryMethods(db);

  const registered = await repository.registerPackageVersion(imported);

  assertEquals(registered.appId, 'chapter-4-asteroids');
  assertEquals(registered.version, '0.1.0');
  assertEquals(registered.capabilities, imported.reviewData.capabilities);
  assertEquals(db.statements[0]?.parameters.slice(0, 3), [
    'chapter-4-asteroids',
    '0.1.0',
    'Chapter 4 Asteroids',
  ]);
});

Deno.test('D1 package version repository lists parsed package version rows', async () => {
  const db = createRecordingD1Database([
    toD1PackageVersionRow(
      buildPackageVersionRecordFromImport(
        buildImportedPackageVersion({
          version: '0.2.0',
        }),
      ),
    ),
    toD1PackageVersionRow(buildPackageVersionRecordFromImport(buildImportedPackageVersion())),
  ]);
  const repository = createD1PackageVersionRepositoryMethods(db);

  const versions = await repository.listPackageVersionsByApp('chapter-4-asteroids');

  assertEquals(
    versions.map((version) => version.version),
    ['0.2.0', '0.1.0'],
  );
  assertEquals(db.statements[0]?.parameters, ['chapter-4-asteroids']);
});

Deno.test('D1 package version repository reports duplicate package versions clearly', async () => {
  const db = createRecordingD1Database([], {
    runError: new Error(
      'UNIQUE constraint failed: package_versions.app_id, package_versions.version',
    ),
  });
  const repository = createD1PackageVersionRepositoryMethods(db);

  await assertRejects(
    () => repository.registerPackageVersion(buildImportedPackageVersion()),
    Error,
    'Package version chapter-4-asteroids@0.1.0 already exists and cannot be replaced.',
  );
});

Deno.test('D1 package version repository reviews package versions with JSON accessibility review', async () => {
  const reviewed = buildPackageVersionRecordFromImport(buildImportedPackageVersion());
  const db = createRecordingD1Database([
    toD1PackageVersionRow({
      ...reviewed,
      approvalStatus: 'approved',
      reviewNotes: 'Reviewed.',
      accessibilityReview: buildAccessibilityReview(),
      reviewedAt: '2026-05-13T15:00:00.000Z',
    }),
  ]);
  const repository = createD1PackageVersionRepositoryMethods(db);

  const approved = await repository.approvePackageVersion({
    id: 1,
    reviewNotes: 'Reviewed.',
    accessibilityReview: buildAccessibilityReview(),
  });

  assertEquals(approved.approvalStatus, 'approved');
  assertEquals(db.statements[0]?.parameters[0], 'approved');
  assertEquals(db.statements[0]?.parameters[1], 'Reviewed.');
  assertEquals(typeof db.statements[0]?.parameters[2], 'string');
});

interface RecordingD1Options {
  runError?: Error;
}

interface RecordedStatement {
  query: string;
  parameters: D1Parameter[];
}

type D1Row = Record<string, unknown>;

function createRecordingD1Database(
  rows: D1Row[],
  options: RecordingD1Options = {},
): D1Database & { statements: RecordedStatement[] } {
  const statements: RecordedStatement[] = [];

  return {
    statements,
    prepare(query) {
      return createRecordingD1Statement(query, rows, statements, options);
    },
    batch(_statements) {
      return Promise.resolve([]);
    },
    exec(_query) {
      return Promise.resolve({
        count: 0,
        duration: 0,
      });
    },
  };
}

function createRecordingD1Statement(
  query: string,
  rows: D1Row[],
  statements: RecordedStatement[],
  options: RecordingD1Options,
): D1PreparedStatement {
  let parameters: D1Parameter[] = [];

  return {
    bind(...values) {
      parameters = values;
      return this;
    },
    all<T>() {
      statements.push({ query, parameters });
      return Promise.resolve({ success: true, results: rows as T[] });
    },
    first<T>() {
      statements.push({ query, parameters });
      return Promise.resolve((rows[0] as T | undefined) ?? null);
    },
    run() {
      statements.push({ query, parameters });

      if (options.runError) {
        throw options.runError;
      }

      return Promise.resolve({ success: true } satisfies D1Result<Record<string, unknown>>);
    },
    raw<T>() {
      return Promise.resolve([] as T[]);
    },
  };
}

function buildPackageVersionRecordFromImport(
  imported: ReturnType<typeof buildImportedPackageVersion>,
): PackageVersionRecord {
  return {
    id: 1,
    appId: imported.reviewData.appId,
    version: imported.reviewData.version,
    title: imported.reviewData.title,
    description: imported.reviewData.description,
    owner: imported.reviewData.owner,
    entrypoint: imported.reviewData.entrypoint,
    roles: imported.reviewData.roles,
    installScope: imported.reviewData.installScope,
    capabilities: imported.reviewData.capabilities,
    grading: imported.reviewData.grading,
    approvalStatus: 'pending',
    reviewNotes: null,
    accessibilityReview: null,
    reviewedAt: null,
    validationIssues: imported.reviewData.validationIssues,
    manifestJson: imported.reviewData.manifestJson,
    artifact: imported.artifact,
    runtimeContract: imported.runtimeContract,
    runtimeContractSignature: imported.runtimeContractSignature,
    importedAt: '2026-05-13T12:00:00.000Z',
  };
}

function toD1PackageVersionRow(record: PackageVersionRecord): D1Row {
  return {
    id: record.id,
    appId: record.appId,
    version: record.version,
    title: record.title,
    description: record.description,
    ownerType: record.owner.type,
    ownerId: record.owner.id,
    entrypoint: record.entrypoint,
    roles: JSON.stringify(record.roles),
    installScope: record.installScope,
    capabilities: JSON.stringify(record.capabilities),
    gradingMode: record.grading.mode,
    gradingRubricFile: record.grading.rubricFile,
    gradingMaxScore: record.grading.maxScore,
    approvalStatus: record.approvalStatus,
    reviewNotes: record.reviewNotes,
    accessibilityReview: record.accessibilityReview === null
      ? null
      : JSON.stringify(record.accessibilityReview),
    reviewedAt: record.reviewedAt,
    validationIssues: JSON.stringify(record.validationIssues),
    manifestJson: JSON.stringify(record.manifestJson),
    artifactRoot: record.artifact.snapshotRoot,
    artifactDigest: record.artifact.digest,
    runtimeContract: JSON.stringify(record.runtimeContract),
    runtimeContractSignature: record.runtimeContractSignature,
    importedAt: record.importedAt,
  };
}

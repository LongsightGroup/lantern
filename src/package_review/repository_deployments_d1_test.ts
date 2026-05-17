import { assertEquals, assertRejects } from '@std/assert';
import type { D1Database, D1Parameter, D1PreparedStatement, D1Result } from '../db/d1.ts';
import { createD1DeploymentRepositoryMethods } from './repository_deployments_d1.ts';

Deno.test('D1 deployment repository maps deployment rows', async () => {
  const db = createPlannedD1Database({
    allResults: [[buildD1DeploymentRow()]],
  });
  const repository = createD1DeploymentRepositoryMethods(db);

  const deployments = await repository.listDeploymentsByApp('chapter-4-asteroids');

  assertEquals(deployments.length, 1);
  assertEquals(deployments[0]?.binding, {
    lms: 'canvas',
    canvasEnvironment: 'production',
    issuer: 'https://canvas.example',
    clientId: 'client-1',
    deploymentId: 'deployment-1',
  });
  assertEquals(db.statements[0]?.parameters, ['chapter-4-asteroids']);
});

Deno.test('D1 deployment repository saves exact non-Canvas bindings', async () => {
  const saved = buildD1DeploymentRow({
    lmsType: 'moodle',
    canvasEnvironment: null,
    authorizationEndpoint: 'https://moodle.example/oidc',
    accessTokenUrl: 'https://moodle.example/token',
    jwksUrl: 'https://moodle.example/jwks',
  });
  const db = createPlannedD1Database({
    firstResults: [null, null, null, saved],
  });
  const repository = createD1DeploymentRepositoryMethods(db);

  const deployment = await repository.saveDeploymentBinding({
    slug: 'chapter-4-asteroids-moodle',
    label: 'Moodle',
    appId: 'chapter-4-asteroids',
    binding: {
      lms: 'moodle',
      issuer: 'https://moodle.example',
      clientId: 'moodle-client',
      deploymentId: 'moodle-deployment',
      authorizationEndpoint: 'https://moodle.example/oidc',
      accessTokenUrl: 'https://moodle.example/token',
      jwksUrl: 'https://moodle.example/jwks',
    },
  });

  assertEquals(deployment.binding?.lms, 'moodle');
  assertEquals(db.statements[3]?.parameters.slice(0, 4), [
    'chapter-4-asteroids-moodle',
    'Moodle',
    'chapter-4-asteroids',
    'moodle',
  ]);
});

Deno.test('D1 deployment repository rejects unapproved package pins', async () => {
  const db = createPlannedD1Database({
    firstResults: [
      {
        appId: 'chapter-4-asteroids',
        approvalStatus: 'pending',
        version: '0.1.0',
      },
    ],
  });
  const repository = createD1DeploymentRepositoryMethods(db);

  await assertRejects(
    () =>
      repository.pinDeploymentVersion({
        slug: 'chapter-4-asteroids-canvas',
        label: 'Canvas',
        appId: 'chapter-4-asteroids',
        packageVersionId: 1,
      }),
    Error,
    'Only approved package versions can be enabled.',
  );
});

Deno.test('D1 deployment repository allows pending package pins for preview deployments', async () => {
  const db = createPlannedD1Database({
    firstResults: [
      {
        appId: 'chapter-4-asteroids',
        approvalStatus: 'pending',
        version: '0.2.0',
      },
      null,
      buildD1DeploymentRow({
        slug: 'chapter-4-asteroids-preview',
        label: 'Chapter 4 Asteroids Preview',
        enabledPackageVersionId: 2,
        enabledPackageVersion: '0.2.0',
        lmsType: 'preview',
        canvasEnvironment: null,
      }),
    ],
  });
  const repository = createD1DeploymentRepositoryMethods(db);

  const deployment = await repository.pinDeploymentVersion({
    slug: 'chapter-4-asteroids-preview',
    label: 'Chapter 4 Asteroids Preview',
    appId: 'chapter-4-asteroids',
    packageVersionId: 2,
    lmsType: 'preview',
  });

  assertEquals(deployment.lmsType, 'preview');
  assertEquals(deployment.enabledPackageVersionId, 2);
  assertEquals(db.statements[2]?.parameters, [
    'chapter-4-asteroids-preview',
    'Chapter 4 Asteroids Preview',
    'chapter-4-asteroids',
    'preview',
    2,
  ]);
});

interface PlannedD1Options {
  allResults?: Array<Array<Record<string, unknown>>>;
  firstResults?: Array<Record<string, unknown> | null>;
}

interface RecordedStatement {
  query: string;
  parameters: D1Parameter[];
}

function createPlannedD1Database(
  options: PlannedD1Options,
): D1Database & { statements: RecordedStatement[] } {
  const statements: RecordedStatement[] = [];
  const allResults = [...(options.allResults ?? [])];
  const firstResults = [...(options.firstResults ?? [])];

  return {
    statements,
    prepare(query) {
      return createPlannedD1Statement(query, statements, allResults, firstResults);
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

function createPlannedD1Statement(
  query: string,
  statements: RecordedStatement[],
  allResults: Array<Array<Record<string, unknown>>>,
  firstResults: Array<Record<string, unknown> | null>,
): D1PreparedStatement {
  let parameters: D1Parameter[] = [];

  return {
    bind(...values) {
      parameters = values;
      return this;
    },
    all<T>() {
      statements.push({ query, parameters });
      return Promise.resolve({
        success: true,
        results: (allResults.shift() ?? []) as T[],
      });
    },
    first<T>() {
      statements.push({ query, parameters });
      return Promise.resolve((firstResults.shift() as T | null | undefined) ?? null);
    },
    run() {
      statements.push({ query, parameters });
      return Promise.resolve({ success: true } satisfies D1Result<Record<string, unknown>>);
    },
    raw<T>() {
      return Promise.resolve([] as T[]);
    },
  };
}

function buildD1DeploymentRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 1,
    slug: 'chapter-4-asteroids-canvas',
    label: 'Canvas',
    appId: 'chapter-4-asteroids',
    enabledPackageVersionId: 1,
    enabledPackageVersion: '0.1.0',
    lmsType: 'canvas',
    canvasEnvironment: 'production',
    issuer: 'https://canvas.example',
    clientId: 'client-1',
    deploymentId: 'deployment-1',
    authorizationEndpoint: null,
    accessTokenUrl: null,
    jwksUrl: null,
    ltiProfileOverride: null,
    updatedAt: '2026-05-13T12:00:00.000Z',
    ...overrides,
  };
}

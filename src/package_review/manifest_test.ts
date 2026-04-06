import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
  assertStringIncludes,
} from '@std/assert';
import { getTestToolPrivateJwkEnvValue } from '../test_helpers/lti.ts';
import { validateManifest } from './manifest.ts';
import {
  buildSignedReviewedRuntimeContract,
  verifyReviewedRuntimeContractSignature,
} from './runtime_contract.ts';
import { getReferencePackageSourceRoot, listReferencePackageIds } from './intake.ts';

type ManifestFixture = {
  schema_version: string;
  app_id: string;
  version: string;
  title: string;
  description?: string;
  owner: {
    type: 'user';
    id: string;
  };
  entrypoint: string;
  roles: string[];
  install_scope?: string;
  capabilities: string[];
  grading: {
    mode: string;
    rubric_file?: string;
    max_score?: number;
  };
  browser?: {
    fullscreen?: boolean;
    clipboard_write?: boolean;
  };
  content_files?: string[];
  preview?: {
    fixtures_file: string;
    tests_file: string;
  };
  icon?: string;
};

const DEMO_SOURCE_ROOT = 'examples/apps/chapter-4-asteroids';
const TEST_RUNTIME_CONTRACT_ENV = {
  get(name: string): string | undefined {
    return name === 'LTI_TOOL_PRIVATE_JWK' ? getTestToolPrivateJwkEnvValue() : undefined;
  },
};

async function writeJson(path: string, value: unknown): Promise<void> {
  await Deno.writeTextFile(path, JSON.stringify(value, null, 2));
}

async function createPackageFixture(
  manifest: ManifestFixture,
  options: {
    includeEntrypoint?: boolean;
    includeRubric?: boolean;
    includeContent?: boolean;
    includePreview?: boolean;
  } = {},
): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: 'lantern-manifest-' });
  const includeEntrypoint = options.includeEntrypoint ?? true;
  const includeRubric = options.includeRubric ?? true;
  const includeContent = options.includeContent ?? true;
  const includePreview = options.includePreview ?? true;

  await Deno.mkdir(`${root}/dist`, { recursive: true });

  if (includeEntrypoint) {
    await Deno.writeTextFile(`${root}/dist/index.html`, '<!doctype html>');
  }

  if (includeRubric) {
    await Deno.mkdir(`${root}/scoring`, { recursive: true });
    await writeJson(`${root}/scoring/rubric.json`, { max_score: 100 });
  }

  if (includeContent) {
    await Deno.mkdir(`${root}/content`, { recursive: true });
    await writeJson(`${root}/content/activity.json`, { lesson: 4 });
  }

  if (includePreview) {
    await Deno.mkdir(`${root}/preview`, { recursive: true });
    await writeJson(`${root}/preview/fixtures.json`, { fixture: true });
    await writeJson(`${root}/preview/tests.json`, { test: true });
  }

  await writeJson(`${root}/manifest.json`, manifest);

  return root;
}

function buildValidManifest(): ManifestFixture {
  return {
    schema_version: '1',
    app_id: 'chapter-4-asteroids',
    version: '0.1.0',
    title: 'Chapter 4 Asteroids',
    description: 'Shoot the correct vocabulary target.',
    owner: {
      type: 'user',
      id: 'instructor_123',
    },
    entrypoint: '/dist/index.html',
    roles: ['learner', 'instructor'],
    install_scope: 'course',
    capabilities: [
      'read_launch_context',
      'read_activity_content',
      'submit_attempt_event',
      'finalize_attempt',
      'read_local_state',
      'write_local_state',
    ],
    grading: {
      mode: 'declarative',
      rubric_file: '/scoring/rubric.json',
      max_score: 100,
    },
    content_files: ['/content/activity.json'],
    preview: {
      fixtures_file: '/preview/fixtures.json',
      tests_file: '/preview/tests.json',
    },
  };
}

Deno.test('validateManifest accepts the demo manifest and returns typed review data', async () => {
  const result = await validateManifest({ sourceRoot: DEMO_SOURCE_ROOT });

  assertEquals(result.ok, true);

  if (!result.ok) {
    throw new Error(`Expected demo package to validate: ${JSON.stringify(result.issues)}`);
  }

  assertEquals(result.issues, []);
  assertEquals(result.reviewData.appId, 'chapter-4-asteroids');
  assertEquals(result.reviewData.version, '0.1.0');
  assertEquals(result.reviewData.title, 'Chapter 4 Asteroids');
  assertEquals(result.reviewData.owner.id, 'instructor_123');
  assertEquals(result.reviewData.entrypoint, '/dist/index.html');
  assertEquals(result.reviewData.grading.mode, 'declarative');
  assertEquals(result.reviewData.grading.rubricFile, '/scoring/rubric.json');
  assertEquals(result.reviewData.validationIssues, []);
});

Deno.test('reviewed runtime contracts fail closed when the approved artifact, capability manifest, or signature drifts', async () => {
  const result = await validateManifest({ sourceRoot: DEMO_SOURCE_ROOT });

  assertEquals(result.ok, true);

  if (!result.ok) {
    throw new Error(`Expected demo package to validate: ${JSON.stringify(result.issues)}`);
  }

  const signedContract = await buildSignedReviewedRuntimeContract({
    reviewData: result.reviewData,
    artifactDigest: 'sha256:chapter-4-asteroids-reviewed',
    env: TEST_RUNTIME_CONTRACT_ENV,
  });
  const driftedContract = await buildSignedReviewedRuntimeContract({
    reviewData: result.reviewData,
    artifactDigest: 'sha256:chapter-4-asteroids-reviewed-drifted',
    env: TEST_RUNTIME_CONTRACT_ENV,
  });

  assertNotEquals(signedContract.runtimeContract, driftedContract.runtimeContract);
  assertNotEquals(
    signedContract.runtimeContractSignature,
    driftedContract.runtimeContractSignature,
  );

  await verifyReviewedRuntimeContractSignature({
    runtimeContract: signedContract.runtimeContract,
    runtimeContractSignature: signedContract.runtimeContractSignature,
    env: TEST_RUNTIME_CONTRACT_ENV,
  });

  await assertRejects(
    () =>
      verifyReviewedRuntimeContractSignature({
        runtimeContract: {
          ...signedContract.runtimeContract,
          capabilities: signedContract.runtimeContract.capabilities.slice(1),
        },
        runtimeContractSignature: signedContract.runtimeContractSignature,
        env: TEST_RUNTIME_CONTRACT_ENV,
      }),
    Error,
    'Runtime contract integrity check failed.',
  );
  await assertRejects(
    () =>
      verifyReviewedRuntimeContractSignature({
        runtimeContract: signedContract.runtimeContract,
        runtimeContractSignature: `${signedContract.runtimeContractSignature}tampered`,
        env: TEST_RUNTIME_CONTRACT_ENV,
      }),
    Error,
    'Runtime contract integrity check failed.',
  );
});

Deno.test('validateManifest accepts each curated reference app manifest and keeps the governed contract narrow', async () => {
  for (const appId of listReferencePackageIds()) {
    const result = await validateManifest({
      sourceRoot: getReferencePackageSourceRoot(appId),
    });

    assertEquals(result.ok, true);

    if (!result.ok) {
      throw new Error(
        `Expected curated reference package ${appId} to validate: ${JSON.stringify(result.issues)}`,
      );
    }

    assertEquals(result.reviewData.appId, appId);
    assertEquals(result.reviewData.capabilities.includes('finalize_attempt'), true);
    assertEquals(result.reviewData.capabilities.includes('read_activity_content'), true);
  }
});

Deno.test('validateManifest maps schema failures into a plain-language fix list', async () => {
  const root = await createPackageFixture({
    ...buildValidManifest(),
    entrypoint: '/index.html',
    grading: {
      mode: 'declarative',
    },
  });

  try {
    const result = await validateManifest({ sourceRoot: root });

    assertEquals(result.ok, false);

    if (result.ok) {
      throw new Error('Expected manifest validation to fail.');
    }

    assertEquals(
      result.issues.map((issue: { field: string }) => issue.field),
      ['/entrypoint', '/grading/rubric_file', '/grading/max_score'],
    );
    assertStringIncludes(result.issues[0]?.message ?? '', 'Entrypoint');
    assertStringIncludes(result.issues[1]?.message ?? '', 'rubric file');
    assertStringIncludes(result.issues[2]?.message ?? '', 'max score');
    for (const issue of result.issues) {
      assert(!issue.message.includes('must match pattern'));
      assert(!issue.message.includes('must have required property'));
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test('validateManifest reports missing referenced files as field-oriented fixes', async () => {
  const root = await createPackageFixture(buildValidManifest(), {
    includeRubric: false,
    includePreview: false,
  });

  try {
    const result = await validateManifest({ sourceRoot: root });

    assertEquals(result.ok, false);

    if (result.ok) {
      throw new Error('Expected missing package files to fail validation.');
    }

    assertEquals(
      result.issues.map((issue: { field: string }) => issue.field),
      ['/grading/rubric_file', '/preview/fixtures_file', '/preview/tests_file'],
    );
    assertStringIncludes(result.issues[0]?.message ?? '', '/scoring/rubric.json');
    assertStringIncludes(result.issues[1]?.message ?? '', '/preview/fixtures.json');
    assertStringIncludes(result.issues[2]?.message ?? '', '/preview/tests.json');
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

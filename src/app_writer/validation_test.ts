import { assertEquals } from '@std/assert';
import {
  validateGeneratedAppPackage,
  validateGeneratedAppPackagePlanAlignment,
} from './validation.ts';
import type { AppGenerationPlan } from './types.ts';
import {
  buildValidBrowserAutograderFiles,
  buildValidSimpleActivityFiles,
} from '../test_helpers/app_writer_generated_package.ts';

Deno.test('generated app validation accepts a minimal simple activity package', async () => {
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files: buildValidSimpleActivityFiles(),
  });

  assertEquals(findings, []);
});

Deno.test('generated app validation rejects files outside the starter allowlist', async () => {
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files: [
      ...buildValidSimpleActivityFiles(),
      {
        path: 'server/worker.ts',
        contents: 'export default {};\n',
      },
    ],
  });

  assertEquals(
    findings.some((finding) => finding.code === 'file_path_not_allowed'),
    true,
  );
});

Deno.test('generated app validation ignores non-package workspace files', async () => {
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files: [
      ...buildValidSimpleActivityFiles(),
      {
        path: 'AGENTS.md',
        role: 'package',
        contents: 'Use Lantern SDK APIs only.\n',
      },
      {
        path: '.lantern/contracts/sdk.d.ts',
        contents: 'declare global { interface Window {} }\n',
      },
      {
        path: 'source/app.ts',
        role: 'package',
        contents: 'const x: string = "authoring evidence only";\n',
      },
    ],
  });

  assertEquals(findings, []);
});

Deno.test('generated app validation rejects external network and storage fallbacks', async () => {
  const files = buildValidSimpleActivityFiles().map((file) =>
    file.path === 'dist/app.js'
      ? {
        ...file,
        contents:
          `${file.contents}\nfetch("https://example.com");\nlocalStorage.setItem("x", "1");\nindexedDB.open("x");\ndocument.cookie = "x=1";\neval("console.log(1)");\nnew Function("return 1");\n`,
      }
      : file
  );
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files,
  });

  assertEquals(
    findings.some((finding) => finding.code === 'external_network_forbidden'),
    true,
  );
  assertEquals(
    findings.some((finding) => finding.code === 'browser_storage_forbidden'),
    true,
  );
  assertEquals(
    findings.some((finding) => finding.code === 'browser_persistent_storage_forbidden'),
    true,
  );
  assertEquals(
    findings.some((finding) => finding.code === 'dynamic_code_execution_forbidden'),
    true,
  );
});

Deno.test('generated app validation rejects Worker and Durable Object platform code', async () => {
  const files = buildValidSimpleActivityFiles().map((file) =>
    file.path === 'dist/app.js'
      ? {
        ...file,
        contents: `${file.contents}
export default {
  async fetch(request, env, ctx) {
    const objectId = env.STUDENT_PROGRESS.idFromName("course-1");
    return env.STUDENT_PROGRESS.get(objectId).fetch(request);
  },
};
class StudentProgress extends DurableObject {
  async fetch() {
    return new Response("ok");
  }
}
`,
      }
      : file
  );
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files,
  });

  assertEquals(
    findings.some((finding) => finding.code === 'module_exports_forbidden'),
    true,
  );
  assertEquals(
    findings.some((finding) => finding.code === 'worker_entrypoint_forbidden'),
    true,
  );
  assertEquals(
    findings.some((finding) => finding.code === 'durable_object_forbidden'),
    true,
  );
});

Deno.test('generated app validation rejects direct SCORM, xAPI, cmi5, and LRS runtimes', async () => {
  const files = buildValidSimpleActivityFiles().map((file) =>
    file.path === 'dist/app.js'
      ? {
        ...file,
        contents: `${file.contents}
window.API.LMSInitialize("");
window.API.LMSSetValue("cmi.core.lesson_status", "completed");
sendXAPIStatement({ verb: "answered" });
fetch("https://lrs.example.test/xapi");
const launchMode = "cmi5";
`,
      }
      : file
  );
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files,
  });

  assertEquals(
    findings.some((finding) => finding.code === 'standards_runtime_forbidden'),
    true,
  );
});

Deno.test('generated app validation rejects SDK capability mismatches', async () => {
  const files = buildValidSimpleActivityFiles().map((file) =>
    file.path === 'manifest.json'
      ? {
        ...file,
        contents: file.contents.replace('"submit_attempt_event",', ''),
      }
      : file
  );
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files,
  });

  assertEquals(
    findings.some((finding) => finding.code === 'sdk_capability_missing'),
    true,
  );
});

Deno.test('generated app validation rejects modified pinned style files', async () => {
  const files = buildValidSimpleActivityFiles().map((file) =>
    file.path === 'dist/pico.min.css'
      ? {
        ...file,
        contents: `${file.contents}\nbody { background: red; }\n`,
      }
      : file
  );
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files,
  });

  assertEquals(
    findings.some((finding) => finding.code === 'pinned_style_file_modified'),
    true,
  );
});

Deno.test('generated app validation rejects missing Lantern design shell', async () => {
  const files = buildValidSimpleActivityFiles().map((file) =>
    file.path === 'dist/index.html'
      ? {
        ...file,
        contents:
          '<!doctype html><html><head><link rel="stylesheet" href="./pico.min.css"><link rel="stylesheet" href="./app.css"></head><body><main data-test="app-title">Phonics Match</main><script src="./app.js"></script></body></html>\n',
      }
      : file
  );
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files,
  });

  assertEquals(
    findings.some((finding) => finding.code === 'design_stylesheet_missing'),
    true,
  );
  assertEquals(
    findings.some((finding) => finding.code === 'design_app_shell_missing'),
    true,
  );
});

Deno.test('generated app validation rejects manifest drift from the app plan', () => {
  const files = buildValidSimpleActivityFiles().map((file) =>
    file.path === 'manifest.json'
      ? {
        ...file,
        contents: file.contents
          .replace('"app_id": "phonics-match"', '"app_id": "starter-simple-activity"')
          .replace('"finalize_attempt"', '"write_local_state"'),
      }
      : file
  );
  const findings = validateGeneratedAppPackagePlanAlignment({
    appPlan: buildPlan(),
    files,
  });

  assertEquals(
    findings.some((finding) => finding.code === 'manifest_plan_app_id_mismatch'),
    true,
  );
  assertEquals(
    findings.some((finding) => finding.code === 'manifest_plan_capability_missing'),
    true,
  );
  assertEquals(
    findings.some((finding) => finding.code === 'manifest_plan_capability_extra'),
    true,
  );
});

Deno.test('generated app validation accepts a browser autograder package shape', async () => {
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'browser-autograder',
    files: buildValidBrowserAutograderFiles(),
  });

  assertEquals(findings, []);
});

function buildPlan(): AppGenerationPlan {
  return {
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
  };
}

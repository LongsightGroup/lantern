import type { AppManifest } from "../package_review/manifest_contract.ts";
import type { PackageVersionRecord } from "../package_review/types.ts";

export interface BrowserGraderAssetUrls {
  jasmineUrl: string;
  runnerUrl: string;
}

export interface ReviewedBrowserGraderConfig {
  reviewedSpecFiles: string[];
  scoreMaximum: number;
}

export function buildBrowserGraderAssetUrls(input: {
  runtimeBaseUrl: string;
}): BrowserGraderAssetUrls {
  return {
    jasmineUrl: `${input.runtimeBaseUrl}/browser-grader/jasmine.js`,
    runnerUrl: `${input.runtimeBaseUrl}/browser-grader/runner.js`,
  };
}

export function buildBrowserGraderHarnessSource(): string {
  return `(() => {
  const root = window;
  const state = {
    tests: [],
    suiteStack: [],
    currentSource: null,
  };

  function formatValue(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function matches(condition, negate) {
    return negate ? !condition : condition;
  }

  function createExpect(actual, negate = false) {
    const assertMatch = (condition, positiveMessage, negativeMessage) => {
      if (!matches(condition, negate)) {
        throw new Error(negate ? negativeMessage : positiveMessage);
      }
    };

    return new Proxy({
      toBe(expected) {
        assertMatch(
          Object.is(actual, expected),
          'Expected ' + formatValue(actual) + ' to be ' + formatValue(expected) + '.',
          'Expected ' + formatValue(actual) + ' not to be ' + formatValue(expected) + '.',
        );
      },
      toEqual(expected) {
        assertMatch(
          JSON.stringify(actual) === JSON.stringify(expected),
          'Expected ' + formatValue(actual) + ' to equal ' + formatValue(expected) + '.',
          'Expected ' + formatValue(actual) + ' not to equal ' + formatValue(expected) + '.',
        );
      },
      toBeNull() {
        assertMatch(
          actual === null,
          'Expected ' + formatValue(actual) + ' to be null.',
          'Expected value not to be null.',
        );
      },
      toBeTruthy() {
        assertMatch(
          Boolean(actual),
          'Expected ' + formatValue(actual) + ' to be truthy.',
          'Expected ' + formatValue(actual) + ' not to be truthy.',
        );
      },
      toContain(expected) {
        const condition = Array.isArray(actual)
          ? actual.includes(expected)
          : typeof actual === 'string'
          ? actual.includes(String(expected))
          : false;
        assertMatch(
          condition,
          'Expected ' + formatValue(actual) + ' to contain ' + formatValue(expected) + '.',
          'Expected ' + formatValue(actual) + ' not to contain ' + formatValue(expected) + '.',
        );
      },
    }, {
      get(target, property, receiver) {
        if (property === 'not') {
          return createExpect(actual, !negate);
        }

        return Reflect.get(target, property, receiver);
      },
    });
  }

  function reset() {
    state.tests = [];
    state.suiteStack = [];
    state.currentSource = null;
  }

  function beginSpecRegistration(source) {
    state.currentSource = source;
  }

  function finishSpecRegistration() {
    state.currentSource = null;
  }

  function describe(name, callback) {
    state.suiteStack.push(name);

    try {
      callback();
    } finally {
      state.suiteStack.pop();
    }
  }

  function it(name, callback) {
    if (!state.currentSource) {
      throw new Error('Browser grader specs must load through the Lantern runner.');
    }

    state.tests.push({
      source: state.currentSource,
      name: [...state.suiteStack, name].join(' / '),
      callback,
    });
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = url;
      element.async = false;
      element.onload = () => {
        element.remove();
        resolve();
      };
      element.onerror = () => {
        element.remove();
        reject(new Error('Browser grader script request failed for ' + url + '.'));
      };
      document.head.appendChild(element);
    });
  }

  async function run(input) {
    const results = new Map();

    for (const test of state.tests.slice()) {
      const specResult = results.get(test.source) ?? {
        source: test.source,
        result: 'passed',
        failures: [],
      };

      if (!results.has(test.source)) {
        results.set(test.source, specResult);
      }

      try {
        await test.callback();
      } catch (error) {
        specResult.result = 'failed';
        specResult.failures.push(
          test.name + ': ' + (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    const specResults = [...results.values()];
    const passedCount = specResults.filter((result) => result.result === 'passed').length;
    const totalCount = specResults.length;
    const scoreGiven = totalCount === 0
      ? 0
      : Math.round((passedCount / totalCount) * input.scoreMaximum);

    return {
      scoreGiven,
      scoreMaximum: input.scoreMaximum,
      specResults,
    };
  }

  root.__LanternBrowserGrader = {
    beginSpecRegistration,
    finishSpecRegistration,
    reset,
    loadScript,
    run,
  };
  root.describe = describe;
  root.it = it;
  root.expect = (actual) => createExpect(actual);
})();`;
}

export function buildBrowserGraderRunnerSource(input: {
  runtimeBaseUrl: string;
  reviewedSpecFiles: string[];
  scoreMaximum: number;
  token?: string;
}): string {
  const specEntries = input.reviewedSpecFiles.map((source, index) => ({
    source,
    url: buildReviewedBrowserGraderSpecUrl(
      input.token
        ? {
          runtimeBaseUrl: input.runtimeBaseUrl,
          index,
          token: input.token,
        }
        : {
          runtimeBaseUrl: input.runtimeBaseUrl,
          index,
        },
    ),
  }));

  return `(() => {
  const browserGraderConfig = ${
    JSON.stringify({
      reviewedSpecFiles: specEntries,
      scoreMaximum: input.scoreMaximum,
    })
  };

  window.__LanternBrowserGraderRunner = {
    async run() {
      const harness = window.__LanternBrowserGrader;

      if (!harness) {
        throw new Error('Browser grader harness was not loaded.');
      }

      harness.reset();

      for (const spec of browserGraderConfig.reviewedSpecFiles) {
        harness.beginSpecRegistration(spec.source);

        try {
          await harness.loadScript(spec.url);
        } finally {
          harness.finishSpecRegistration();
        }
      }

      return await harness.run({
        scoreMaximum: browserGraderConfig.scoreMaximum,
      });
    },
  };
})();`;
}

export function readLocalBrowserGraderConfig(input: {
  gradingMode: string;
  gradingMaxScore: number | null;
  authoring: AppManifest["authoring"] | null;
}): ReviewedBrowserGraderConfig | null {
  if (input.gradingMode !== "browser") {
    return null;
  }

  if (input.gradingMaxScore === null) {
    throw new Error("Browser grading requires a reviewed max score.");
  }

  if (!input.authoring || input.authoring.kind !== "browser_autograder") {
    throw new Error(
      'Browser grading requires authoring.kind = "browser_autograder".',
    );
  }

  if (input.authoring.grader_spec_files.length === 0) {
    throw new Error("Browser grading requires reviewed grader spec files.");
  }

  return {
    reviewedSpecFiles: [...input.authoring.grader_spec_files],
    scoreMaximum: input.gradingMaxScore,
  };
}

export function readReviewedBrowserGraderConfig(
  packageVersion: Pick<PackageVersionRecord, "grading" | "manifestJson">,
): ReviewedBrowserGraderConfig | null {
  return readLocalBrowserGraderConfig({
    gradingMode: packageVersion.grading.mode,
    gradingMaxScore: packageVersion.grading.maxScore,
    authoring: readAuthoringFromManifestJson(packageVersion.manifestJson),
  });
}

function buildReviewedBrowserGraderSpecUrl(input: {
  runtimeBaseUrl: string;
  index: number;
  token?: string;
}): string {
  const baseUrl =
    `${input.runtimeBaseUrl}/browser-grader/reviewed/${input.index}.js`;

  if (!input.token) {
    return baseUrl;
  }

  return `${baseUrl}?token=${encodeURIComponent(input.token)}`;
}

function readAuthoringFromManifestJson(
  manifestJson: Record<string, unknown>,
): AppManifest["authoring"] | null {
  const authoring = manifestJson.authoring;

  if (!authoring || typeof authoring !== "object" || Array.isArray(authoring)) {
    return null;
  }

  const authoringRecord = authoring as Record<string, unknown>;
  const kind = typeof authoringRecord.kind === "string"
    ? authoringRecord.kind
    : null;
  const graderSpecFiles = Array.isArray(authoringRecord.grader_spec_files)
    ? authoringRecord.grader_spec_files.filter(
      (value: unknown): value is string => typeof value === "string",
    )
    : [];
  const evidenceExampleFile =
    typeof authoringRecord.evidence_example_file === "string"
      ? authoringRecord.evidence_example_file
      : "";

  if (kind !== "browser_autograder" || evidenceExampleFile === "") {
    return null;
  }

  return {
    kind,
    grader_spec_files: graderSpecFiles,
    evidence_example_file: evidenceExampleFile,
  };
}

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildBrowserGraderAssetUrls,
  buildBrowserGraderRunnerSource,
} from "./browser_grader.ts";

Deno.test("browser grader assets stay on the runtime session origin", () => {
  const urls = buildBrowserGraderAssetUrls({
    runtimeBaseUrl:
      "https://runtime.lantern.example/runtime/sessions/runtime-session-123",
  });

  assertEquals(
    urls.jasmineUrl,
    "https://runtime.lantern.example/runtime/sessions/runtime-session-123/browser-grader/jasmine.js",
  );
  assertEquals(
    urls.runnerUrl,
    "https://runtime.lantern.example/runtime/sessions/runtime-session-123/browser-grader/runner.js",
  );
});

Deno.test("browser grader runner source only points at reviewed same-origin specs", () => {
  const source = buildBrowserGraderRunnerSource({
    reviewedSpecFiles: [
      "/grading/specs/structure.spec.js",
      "/grading/specs/behavior.spec.js",
    ],
    scoreMaximum: 100,
  });

  assertStringIncludes(source, "./reviewed/' + index + '.js");
  assertStringIncludes(source, '"scoreMaximum":100');
  assertEquals(source.includes("/dist/app.js"), false);
});

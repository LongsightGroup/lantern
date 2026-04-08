import { assertEquals } from "@std/assert";
import { buildDraftDiff } from "./draft_diff.ts";

Deno.test("buildDraftDiff renders explicit additions and removals for authoring files", () => {
  const [diff] = buildDraftDiff({
    currentFiles: [
      {
        path: "/grading/specs/checks.spec.js",
        contents:
          'describe("template authoring checks", () => {\n  it("renders the starter title", () => {});\n});\n',
      },
    ],
    generatedFiles: [
      {
        path: "/grading/specs/checks.spec.js",
        contents:
          'describe("template authoring checks", () => {\n  it("checks alt text coverage", () => {});\n});\n',
      },
    ],
  });

  assertEquals(diff?.path, "/grading/specs/checks.spec.js");
  assertEquals(diff?.status, "changed");
  assertEquals(
    diff?.lines.some(
      (line) =>
        line.kind === "removed" &&
        line.value.includes("renders the starter title"),
    ),
    true,
  );
  assertEquals(
    diff?.lines.some(
      (line) =>
        line.kind === "added" &&
        line.value.includes("checks alt text coverage"),
    ),
    true,
  );
});

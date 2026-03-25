import { assertEquals, assertStringIncludes } from "@std/assert";
import { renderHomePage } from "./home.ts";

Deno.test("renderHomePage includes the public capability story sections and evaluator next step", () => {
  const html = renderHomePage();

  assertStringIncludes(html, "Governed capabilities");
  assertStringIncludes(html, "Reporting surfaces");
  assertStringIncludes(html, "Governance process");
  assertStringIncludes(html, "Evaluator next step");
  assertStringIncludes(html, 'href="/admin/packages"');
});

Deno.test("renderHomePage excludes tenant-private identifiers from public output", () => {
  const html = renderHomePage();

  for (
    const forbidden of [
      "issuer",
      "client_id",
      "user_id",
      "deployment_id",
      "resource_link_id",
    ]
  ) {
    assertEquals(html.includes(forbidden), false);
  }
});

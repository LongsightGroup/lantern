import { assertEquals, assertStringIncludes } from "@std/assert";
import { ADMIN_LAYOUT_STYLES } from "./layout_styles.ts";

Deno.test("admin layout styles apply primary button treatment to link buttons", () => {
  assertStringIncludes(
    ADMIN_LAYOUT_STYLES,
    ".button-primary,\n      button.button-primary",
  );
  assertStringIncludes(
    ADMIN_LAYOUT_STYLES,
    ".button-primary:hover,\n      button.button-primary:hover",
  );
});

Deno.test("admin layout styles avoid inset left-edge accent stripes", () => {
  assertEquals(ADMIN_LAYOUT_STYLES.includes("inset 3px 0 0"), false);
});

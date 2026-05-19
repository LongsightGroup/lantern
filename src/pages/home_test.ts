import { assertEquals, assertStringIncludes } from '@std/assert';
import { renderHomePage } from './home.ts';

Deno.test('renderHomePage includes only the operational app entry points', () => {
  const html = renderHomePage();

  assertStringIncludes(html, 'Lantern runtime');
  assertStringIncludes(html, 'Governed learning app runtime and control plane');
  assertStringIncludes(html, 'Institution-facing product pages live in the marketing site.');
  assertStringIncludes(html, 'href="/admin/packages"');
  assertStringIncludes(html, 'href="/admin/deployments"');
  assertStringIncludes(html, 'href="/health"');
  assertEquals(html.includes('why-it-can-say-yes'), false);
  assertEquals(html.includes('Why IT can say yes'), false);
});

Deno.test('renderHomePage excludes tenant-private identifiers from public output', () => {
  const html = renderHomePage();

  for (const forbidden of ['issuer', 'client_id', 'user_id', 'deployment_id', 'resource_link_id']) {
    assertEquals(html.includes(forbidden), false);
  }
});

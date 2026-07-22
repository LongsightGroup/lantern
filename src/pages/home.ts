import { renderLayout } from './layout.ts';

export function renderHomePage(): string {
  return renderLayout(
    'Lantern',
    `<main class="home operational-home">
      <section class="home-hero">
        <p class="eyebrow">Lantern runtime</p>
        <h1>Governed learning app runtime and control plane</h1>
        <p>
          This host serves Lantern's LTI, runtime, package review, and admin routes.
          Institution-facing product pages live in the marketing site.
        </p>
      </section>

      <section class="route-list" aria-label="Primary app routes">
        <a href="/admin/governance">Institution governance</a>
        <a href="/admin/packages">Reviewed apps</a>
        <a href="/health">Health</a>
      </section>
    </main>`,
  );
}

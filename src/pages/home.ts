import { renderLayout } from './layout.ts';

export function renderHomePage(): string {
  return renderLayout(
    'Lantern',
    `<main class="home">
      <section class="home-hero">
        <p class="eyebrow">Security-first learning app runtime</p>
        <h1>Run untrusted learning tools without handing them the LMS</h1>
        <p>
          Lantern turns institution-built and AI-built activities into reviewed app packages that
          launch through one trusted boundary. App code gets only the signed context and capabilities
          Lantern exposes, while Cloudflare Workers, D1, R2, and read-only Dynamic Workers keep
          delivery, grading, evidence, and audit under platform control.
        </p>
      </section>

      <section class="home-grid" aria-label="Lantern capability story">
        <article class="home-card">
          <h2>Least privilege by default</h2>
          <ul>
            <li>No raw LMS tokens, direct D1 access, arbitrary outbound HTTP, or direct grade writes for app code.</li>
            <li>Every launch is tied to a reviewed package version and signed runtime contract.</li>
            <li>Capability requests pass through Lantern's gateway instead of private integration credentials.</li>
          </ul>
        </article>

        <article class="home-card">
          <h2>Cloudflare containment</h2>
          <ul>
            <li>Workers own launch validation, runtime sessions, gateway calls, and audit events.</li>
            <li>D1 stores trusted product state; R2 stores reviewed artifacts and evidence bytes.</li>
            <li>Dynamic Workers serve immutable reviewed browser assets without LMS, D1, or generic outbound capability.</li>
          </ul>
        </article>

        <article class="home-card">
          <h2>Review before runtime</h2>
          <ol>
            <li>Import a package and review the exact artifact digest.</li>
            <li>Approve one version before it can launch from an LMS placement.</li>
            <li>Inspect runtime, grading, and evidence records from Lantern's operator pages.</li>
          </ol>
        </article>

        <article class="home-card">
          <h2>Evaluator next step</h2>
          <p>
            Open the governed control surface to inspect how approvals, placements, runtime sessions,
            and evidence stay behind the control plane.
          </p>
          <p class="home-cta">
            <a href="/admin/packages" class="cta-primary">Open governed control surface</a>
          </p>
        </article>
      </section>
    </main>`,
  );
}

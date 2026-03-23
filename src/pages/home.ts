import { renderLayout } from './layout.ts';

export function renderHomePage(): string {
  return renderLayout(
    'Lantern',
    `<main>
      <span class="tag">Governed App Platform</span>
      <h1>Lantern</h1>
      <p>
        Lantern is a safe runtime for institution-built and AI-built learning apps. The gateway owns
        launch, identity, grading, policy, and audit. Apps stay small, typed, and reviewable.
      </p>

      <section class="section">
        <strong>Current public surface</strong>
        <ul>
          <li>App package spec</li>
          <li>Manifest schema</li>
          <li>SDK contract</li>
          <li>Sample Tier 0 app package</li>
        </ul>
      </section>
    </main>`,
  );
}

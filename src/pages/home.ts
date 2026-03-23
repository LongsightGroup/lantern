import { renderLayout } from './layout.ts';

export function renderHomePage(): string {
  return renderLayout(
    'Lantern',
    `<section class="hero">
      <div class="hero-mark">
        <svg viewBox="0 0 32 32" width="48" height="48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 3L8 10v10l8 9 8-9V10L16 3z" fill="url(#mark-g)" opacity="0.9"/>
          <path d="M16 3L8 10v10l8 9 8-9V10L16 3z" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
          <circle cx="16" cy="15" r="4" fill="white" opacity="0.85"/>
          <defs><linearGradient id="mark-g" x1="8" y1="3" x2="24" y2="29"><stop stop-color="#f59e0b"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs>
        </svg>
      </div>
      <h1>Lantern</h1>
      <p class="hero-sub">The governed app platform</p>
      <p class="hero-desc">
        A safe runtime for institution-built and AI-built learning apps. The gateway owns
        launch, identity, grading, policy, and audit.
      </p>
      <div class="hero-cta">
        <a href="/admin/packages" class="cta-primary">Open control pane</a>
      </div>
    </section>`,
  );
}

import { escapeHtml } from "./admin/layout.ts";

export function renderTopLevelLaunchPage(input: {
  location: string;
}): string {
  const locationJson = JSON.stringify(input.location);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Continue LTI Launch</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(160deg, #f7f4ec 0%, #eef3f6 100%);
        color: #10212e;
      }

      main {
        width: min(32rem, calc(100vw - 2rem));
        padding: 2rem;
        border: 1px solid rgba(16, 33, 46, 0.12);
        border-radius: 1.25rem;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 1rem 3rem rgba(16, 33, 46, 0.08);
      }

      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.5rem;
      }

      p {
        margin: 0 0 1rem;
        line-height: 1.5;
      }

      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 2.75rem;
        padding: 0 1rem;
        border-radius: 999px;
        background: #10212e;
        color: #fff;
        text-decoration: none;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Continue the LMS launch</h1>
      <p>Lantern is reopening this LTI login at the top level so the LMS can complete the browser handoff more reliably.</p>
      <p><a href="${
    escapeHtml(input.location)
  }" target="_top" rel="noreferrer">Continue launch</a></p>
    </main>
    <script>
      const nextLocation = ${locationJson};
      try {
        if (window.top !== window.self) {
          window.top.location = nextLocation;
        } else {
          window.location.replace(nextLocation);
        }
      } catch {
        window.location.replace(nextLocation);
      }
    </script>
  </body>
</html>`;
}

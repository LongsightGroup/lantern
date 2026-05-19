import { escapeHtml } from './admin/layout.ts';

export function renderTopLevelLaunchPage(input: { location: string }): string {
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
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
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
    escapeHtml(
      input.location,
    )
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

export function renderLtiPlatformStorageLaunchPage(input: {
  location: string;
  platformOrigin: string;
  storageTarget: string;
  state: string;
  nonce: string;
}): string {
  const locationJson = JSON.stringify(input.location);
  const platformOriginJson = JSON.stringify(input.platformOrigin);
  const storageTargetJson = JSON.stringify(input.storageTarget);
  const stateKeyJson = JSON.stringify(`lantern:lti:state:${input.state}`);
  const nonceKeyJson = JSON.stringify(`lantern:lti:nonce:${input.state}`);
  const stateJson = JSON.stringify(input.state);
  const nonceJson = JSON.stringify(input.nonce);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Continue LTI Launch</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f7f9fb;
        color: #10212e;
      }

      main {
        width: min(32rem, calc(100vw - 2rem));
        padding: 2rem;
        border: 1px solid rgba(16, 33, 46, 0.12);
        border-radius: 0.5rem;
        background: #fff;
        box-shadow: 0 1rem 3rem rgba(16, 33, 46, 0.08);
      }

      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.5rem;
      }

      p {
        margin: 0;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Continuing the LMS launch</h1>
      <p id="launch-status">Lantern is storing the launch check in the LMS frame before continuing.</p>
    </main>
    <script>
      const nextLocation = ${locationJson};
      const platformOrigin = ${platformOriginJson};
      const storageTarget = ${storageTargetJson};
      const values = [
        { key: ${stateKeyJson}, value: ${stateJson} },
        { key: ${nonceKeyJson}, value: ${nonceJson} },
      ];
      const statusElement = document.getElementById('launch-status');

      function updateStatus(message) {
        if (statusElement) {
          statusElement.textContent = message;
        }
      }

      function readMessageData(data) {
        if (data && typeof data === 'object') {
          return data;
        }

        if (typeof data === 'string') {
          try {
            const parsed = JSON.parse(data);

            if (parsed && typeof parsed === 'object') {
              return parsed;
            }
          } catch {
            return null;
          }
        }

        return null;
      }

      function resolveStorageWindow() {
        const hostWindow = window.parent && window.parent !== window ? window.parent : window.opener;

        if (!hostWindow) {
          throw new Error('LMS platform storage frame was not available.');
        }

        if (storageTarget === '_parent') {
          return hostWindow;
        }

        const targetFrame = hostWindow.frames[storageTarget];

        if (!targetFrame) {
          throw new Error('LMS platform storage target ' + storageTarget + ' was not available.');
        }

        return targetFrame;
      }

      function createMessageId() {
        if (crypto.randomUUID) {
          return 'lantern-' + crypto.randomUUID();
        }

        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);

        return 'lantern-' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      }

      function postPlatformStorageValue(targetWindow, key, value) {
        const messageId = createMessageId();

        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            window.removeEventListener('message', onMessage);
            reject(new Error('LMS platform storage did not acknowledge the launch state.'));
          }, 5000);

          function onMessage(event) {
            if (event.origin !== platformOrigin) {
              return;
            }

            const data = readMessageData(event.data);

            if (
              !data ||
              data.subject !== 'lti.put_data.response' ||
              data.message_id !== messageId
            ) {
              return;
            }

            window.removeEventListener('message', onMessage);
            clearTimeout(timeoutId);

            if (data.error) {
              reject(new Error(data.error.message || data.error.code || 'LMS platform storage rejected the launch state.'));
              return;
            }

            resolve();
          }

          window.addEventListener('message', onMessage);
          targetWindow.postMessage({
            subject: 'lti.put_data',
            message_id: messageId,
            key,
            value,
          }, platformOrigin);
        });
      }

      async function continueLaunch() {
        try {
          const targetWindow = resolveStorageWindow();

          for (const entry of values) {
            await postPlatformStorageValue(targetWindow, entry.key, entry.value);
          }

          window.location.replace(nextLocation);
        } catch (error) {
          updateStatus(error instanceof Error ? error.message : 'LMS platform storage failed.');
        }
      }

      continueLaunch();
    </script>
  </body>
</html>`;
}

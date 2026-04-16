import type { BootstrapPayload } from '../../sdk/app-sdk.ts';
import { buildBrowserGraderAssetUrls } from './browser_grader.ts';

export function buildRuntimeBootstrapScript(input: {
  bootstrap: BootstrapPayload;
  runtimeBaseUrl: string;
  previewSessionId: string | null;
}): string {
  const bootstrapJson = serializeForInlineScript(input.bootstrap);
  const contentUrl = serializeForInlineScript(`${input.runtimeBaseUrl}/content`);
  const localStateUrl = serializeForInlineScript(`${input.runtimeBaseUrl}/local-state`);
  const attemptEventsUrl = serializeForInlineScript(`${input.runtimeBaseUrl}/attempt-events`);
  const evidenceArtifactsUrl = serializeForInlineScript(
    `${input.runtimeBaseUrl}/evidence-artifacts`,
  );
  const scoreProposalUrl = serializeForInlineScript(`${input.runtimeBaseUrl}/score-proposal`);
  const finalizeUrl = serializeForInlineScript(`${input.runtimeBaseUrl}/finalize`);
  const browserGraderUrls = buildBrowserGraderAssetUrls({
    runtimeBaseUrl: input.runtimeBaseUrl,
  });
  const browserGraderJasmineUrl = serializeForInlineScript(browserGraderUrls.jasmineUrl);
  const browserGraderRunnerUrl = serializeForInlineScript(browserGraderUrls.runnerUrl);
  const previewJson = serializeForInlineScript(
    input.previewSessionId === null
      ? null
      : {
          previewSessionId: input.previewSessionId,
        },
  );

  return `window.GatewayBootstrap = ${bootstrapJson};
window.GatewayPreview = ${previewJson};
function isGatewayDeniedResult(value) {
  return Boolean(value) &&
    typeof value === 'object' &&
    value.accepted === false &&
    Boolean(value.denial) &&
    typeof value.denial === 'object' &&
    typeof value.denial.category === 'string' &&
    typeof value.denial.code === 'string';
}
async function readGatewayMutationResponse(response, label) {
  if (response.status === 204) {
    return { accepted: true };
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = await response.json();

    if (response.ok || isGatewayDeniedResult(payload)) {
      return payload;
    }
  }

  if (!response.ok) {
    throw new Error(label + ' failed with status ' + response.status + '.');
  }

  return { accepted: true };
}
function withGatewayToken(url) {
  const separator = url.includes('?') ? '&' : '?';

  return url + separator +
    'token=' + encodeURIComponent(window.GatewayBootstrap.session.token);
}
function loadGatewayScript(url) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element.src = withGatewayToken(url);
    element.async = false;
    element.onload = () => {
      element.remove();
      resolve();
    };
    element.onerror = () => {
      element.remove();
      reject(new Error('Browser grader asset request failed for ' + url + '.'));
    };
    document.head.appendChild(element);
  });
}
async function ensureBrowserGraderLoaded() {
  if (window.__LanternBrowserGraderRunner) {
    return window.__LanternBrowserGraderRunner;
  }

  await loadGatewayScript(${browserGraderJasmineUrl});
  await loadGatewayScript(${browserGraderRunnerUrl});

  if (!window.__LanternBrowserGraderRunner) {
    throw new Error('Browser grader runner was not loaded.');
  }

  return window.__LanternBrowserGraderRunner;
}
window.GatewayApp = {
  getLaunchContext() {
    return Promise.resolve({
      userRole: window.GatewayBootstrap.launch.user_role,
      courseId: window.GatewayBootstrap.launch.course_id,
      ...(window.GatewayBootstrap.launch.assignment_id
        ? { assignmentId: window.GatewayBootstrap.launch.assignment_id }
        : {}),
      activityId: window.GatewayBootstrap.launch.activity_id,
      submissionMode: window.GatewayBootstrap.launch.submission_mode,
    });
  },
  async getActivityContent() {
    const response = await fetch(${contentUrl}, {
      headers: {
        Authorization: 'Bearer ' + window.GatewayBootstrap.session.token,
      },
    });

    if (!response.ok) {
      throw new Error('Activity content request failed with status ' + response.status + '.');
    }

    return await response.json();
  },
  async readLocalState() {
    const response = await fetch(${localStateUrl}, {
      headers: {
        Authorization: 'Bearer ' + window.GatewayBootstrap.session.token,
      },
    });

    if (!response.ok) {
      throw new Error('Local state request failed with status ' + response.status + '.');
    }

    return await response.json();
  },
  async writeLocalState(value) {
    const response = await fetch(${localStateUrl}, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + window.GatewayBootstrap.session.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify(value ?? null),
    });

    return await readGatewayMutationResponse(response, 'Local state write');
  },
  async emitAttemptEvent(event) {
    const response = await fetch(${attemptEventsUrl}, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + window.GatewayBootstrap.session.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    return await readGatewayMutationResponse(response, 'Attempt event request');
  },
  async submitEvidenceArtifact(input) {
    const response = await fetch(${evidenceArtifactsUrl}, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + window.GatewayBootstrap.session.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    return await readGatewayMutationResponse(response, 'Evidence artifact request');
  },
  async submitScoreProposal(input) {
    const response = await fetch(${scoreProposalUrl}, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + window.GatewayBootstrap.session.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    return await readGatewayMutationResponse(response, 'Score proposal request');
  },
  async runBrowserGrader() {
    const runner = await ensureBrowserGraderLoaded();
    return await runner.run();
  },
  async finalizeAttempt(input) {
    const response = await fetch(${finalizeUrl}, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + window.GatewayBootstrap.session.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input ?? {}),
    });

    return await readGatewayMutationResponse(response, 'Finalize request');
  },
};`;
}

export function injectBeforeClosingTag(
  html: string,
  tagName: 'head' | 'body',
  injection: string,
): string {
  const closingTag = `</${tagName}>`;
  const index = html.lastIndexOf(closingTag);

  if (index < 0) {
    return `${html}${injection}`;
  }

  return `${html.slice(0, index)}${injection}${html.slice(index)}`;
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

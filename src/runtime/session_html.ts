import type { BootstrapPayload } from "../../sdk/app-sdk.ts";

export function buildRuntimeBootstrapScript(input: {
  bootstrap: BootstrapPayload;
  runtimeBasePath: string;
  previewSessionId: string | null;
}): string {
  const bootstrapJson = serializeForInlineScript(input.bootstrap);
  const contentUrl = serializeForInlineScript(
    `${input.runtimeBasePath}/content`,
  );
  const attemptEventsUrl = serializeForInlineScript(
    `${input.runtimeBasePath}/attempt-events`,
  );
  const finalizeUrl = serializeForInlineScript(
    `${input.runtimeBasePath}/finalize`,
  );
  const previewJson = serializeForInlineScript(
    input.previewSessionId === null ? null : {
      previewSessionId: input.previewSessionId,
    },
  );

  return `window.GatewayBootstrap = ${bootstrapJson};
window.GatewayPreview = ${previewJson};
window.GatewayApp = {
  getLaunchContext() {
    return Promise.resolve({
      userRole: window.GatewayBootstrap.launch.user_role,
      courseId: window.GatewayBootstrap.launch.course_id,
      ...(window.GatewayBootstrap.launch.assignment_id
        ? { assignmentId: window.GatewayBootstrap.launch.assignment_id }
        : {}),
      activityId: window.GatewayBootstrap.launch.activity_id,
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
  async emitAttemptEvent(event) {
    const response = await fetch(${attemptEventsUrl}, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + window.GatewayBootstrap.session.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error('Attempt event request failed with status ' + response.status + '.');
    }
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

    if (!response.ok) {
      throw new Error('Finalize request failed with status ' + response.status + '.');
    }

    return await response.json();
  },
};`;
}

export function injectBeforeClosingTag(
  html: string,
  tagName: "head" | "body",
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
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

import {
  groupLocalAppDiagnostics,
  type LocalAppPackage,
  type LocalAppValidationDiagnostic,
  validateLocalAppPackage,
} from './local_app.ts';
import {
  createLocalPreviewHarness,
  type LocalPreviewHarness,
  type LocalPreviewLogEntry,
} from './local_preview.ts';
import {
  type FailedLocalPreviewAssertionRuntimeRun,
  type SuccessfulLocalPreviewAssertionRun,
  runLocalPreviewAssertionsForPackage,
} from './local_preview_assertions.ts';
import { renderPreviewAssertionResult } from './local_preview_assertion_report.ts';

export type LocalDevPreviewCheck =
  | {
      kind: 'passed';
      result: Omit<SuccessfulLocalPreviewAssertionRun, 'packageRoot'>;
    }
  | {
      kind: 'failed';
      result: Omit<SuccessfulLocalPreviewAssertionRun, 'packageRoot'>;
    }
  | {
      kind: 'runtime_failed';
      result: Omit<FailedLocalPreviewAssertionRuntimeRun, 'packageRoot'>;
    };

export type LocalDevState =
  | {
      kind: 'valid';
      warnings: string[];
      appPackage: LocalAppPackage;
      harness: LocalPreviewHarness;
      previewCheck: LocalDevPreviewCheck;
    }
  | {
      kind: 'invalid';
      packageRoot: string;
      diagnostics: LocalAppValidationDiagnostic[];
      issues: string[];
      warnings: string[];
    };

export async function loadLocalDevState(
  packageRoot: string,
  input: {
    logger?: (entry: LocalPreviewLogEntry) => void;
  } = {},
): Promise<LocalDevState> {
  const validation = await validateLocalAppPackage(packageRoot);

  if (!validation.ok || !validation.appPackage) {
    return {
      kind: 'invalid',
      packageRoot,
      diagnostics: validation.diagnostics,
      issues: validation.issues,
      warnings: validation.warnings,
    };
  }

  const previewAssertionRun = await runLocalPreviewAssertionsForPackage(validation.appPackage);
  const previewCheck = previewAssertionRun.ok
    ? previewAssertionRun.failedCount === 0
      ? {
          kind: 'passed' as const,
          result: previewAssertionRun,
        }
      : {
          kind: 'failed' as const,
          result: previewAssertionRun,
        }
    : {
        kind: 'runtime_failed' as const,
        result: previewAssertionRun,
      };

  return {
    kind: 'valid',
    warnings: validation.warnings,
    appPackage: validation.appPackage,
    harness: createLocalPreviewHarness({
      appPackage: validation.appPackage,
      ...(input.logger ? { logger: input.logger } : {}),
    }),
    previewCheck,
  };
}

export function createLocalDevRequestHandler(input: {
  getState(): LocalDevState;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const state = input.getState();

    if (state.kind === 'valid') {
      return await state.harness.handle(request);
    }

    return renderInvalidLocalDevResponse(request, state);
  };
}

export function renderLocalDevStateSummary(input: {
  state: LocalDevState;
  baseUrl: string;
}): string {
  if (input.state.kind === 'invalid') {
    const lines = [
      'Lantern authoring dev loop blocked by package validation.',
      `- Preview URL: ${input.baseUrl}`,
    ];

    for (const group of groupLocalAppDiagnostics(input.state.diagnostics)) {
      lines.push(`- ${group.label}`);

      for (const diagnostic of group.diagnostics) {
        lines.push(`  - ${diagnostic.message}`);
        lines.push(`    Fix: ${diagnostic.fix}`);
      }
    }

    for (const warning of input.state.warnings) {
      lines.push(`- Warning: ${warning}`);
    }

    return lines.join('\n');
  }

  const previewUrl = new URL('/', input.baseUrl).toString();
  const renderedPreviewChecks = renderPreviewAssertionResult(input.state.previewCheck.result);
  const lines = [
    'Lantern authoring dev loop ready.',
    `- Preview URL: ${previewUrl}`,
    `- App ID: ${input.state.appPackage.reviewData.appId}`,
    `- Entrypoint: ${input.state.appPackage.manifest.entrypoint}`,
    `- Preview checks: ${
      input.state.previewCheck.kind === 'passed'
        ? 'passing'
        : input.state.previewCheck.kind === 'failed'
          ? 'failing'
          : 'runtime error'
    }`,
    renderedPreviewChecks.output,
  ];

  for (const warning of input.state.warnings) {
    lines.push(`- Warning: ${warning}`);
  }

  return lines.join('\n');
}

function renderInvalidLocalDevResponse(
  request: Request,
  state: Extract<LocalDevState, { kind: 'invalid' }>,
): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json(
      {
        ok: false,
        code: 'package_validation_failed',
        diagnostics: state.diagnostics,
      },
      {
        status: 503,
        headers: {
          'cache-control': 'no-store',
        },
      },
    );
  }

  return new Response(request.method === 'HEAD' ? null : renderInvalidLocalDevPage(state), {
    status: 503,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
    },
  });
}

function renderInvalidLocalDevPage(state: Extract<LocalDevState, { kind: 'invalid' }>): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lantern authoring blocked</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f4ee;
        --panel: #fffdf9;
        --line: #d8cfc2;
        --text: #1e2b31;
        --muted: #5b6970;
        --danger: #9f2f26;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        padding: 2rem;
        background: var(--bg);
        color: var(--text);
        font-family: ui-sans-serif, system-ui, sans-serif;
      }

      main {
        max-width: 56rem;
        margin: 0 auto;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 1rem;
        padding: 1.5rem;
      }

      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.5rem;
      }

      p {
        line-height: 1.5;
      }

      section + section {
        margin-top: 1.5rem;
      }

      .group {
        border-top: 1px solid var(--line);
        padding-top: 1rem;
      }

      .label {
        color: var(--muted);
        font-size: 0.875rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      ul {
        margin: 0.75rem 0 0;
        padding-left: 1.25rem;
      }

      li + li {
        margin-top: 0.75rem;
      }

      strong {
        color: var(--danger);
      }

      code {
        font-family: ui-monospace, SFMono-Regular, monospace;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="label">Lantern authoring</p>
      <h1>Preview is blocked until the reviewed package validates.</h1>
      <p>Fix the issues below and save again. Lantern will reload this preview automatically after the next valid change.</p>
      ${groupLocalAppDiagnostics(state.diagnostics)
        .map(
          (group) =>
            `<section class="group">
        <p class="label">${escapeHtml(group.label)}</p>
        <ul>
          ${group.diagnostics
            .map(
              (diagnostic) =>
                `<li>
            <strong>${escapeHtml(diagnostic.message)}</strong><br />
            Fix: ${escapeHtml(diagnostic.fix)}
          </li>`,
            )
            .join('')}
        </ul>
      </section>`,
        )
        .join('')}
      ${
        state.warnings.length === 0
          ? ''
          : `<section class="group">
        <p class="label">Warnings</p>
        <ul>
          ${state.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}
        </ul>
      </section>`
      }
      <section class="group">
        <p class="label">Package root</p>
        <p><code>${escapeHtml(state.packageRoot)}</code></p>
      </section>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

import type { PythonLabRecord } from './repository.ts';
import type { verifyPythonLabCandidate } from './lab_service.ts';

export const LAB_PATH = '/autograder';

export function labUrl(labId: string): string {
  return `${LAB_PATH}/labs/${encodeURIComponent(labId)}`;
}

export function renderLabCreateForm(turnstileSiteKey: string): string {
  const widget = turnstileSiteKey === ''
    ? `<input type="hidden" name="cf-turnstile-response" value="">`
    : `<div class="cf-turnstile" data-sitekey="${
      escapeHtml(turnstileSiteKey)
    }"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;
  return `<form method="post" action="${LAB_PATH}/labs" class="lab-form">
    <div class="field"><label for="lab-title">Assignment title</label><input id="lab-title" name="title" maxlength="160" required></div>
    <div class="field"><label for="lab-prompt">Assignment prompt</label><textarea id="lab-prompt" name="prompt" rows="7" maxlength="12000" required></textarea></div>
    <div class="field"><label for="lab-function-name">Required function name</label><input id="lab-function-name" name="functionName" pattern="[A-Za-z_][A-Za-z0-9_]*" maxlength="80" required></div>
    <div class="field"><label for="lab-starter-code">Starter code</label><textarea id="lab-starter-code" name="starterCode" class="code" rows="12" maxlength="32000" required></textarea></div>
    <div class="field"><label for="lab-reference-code">Known-correct reference solution</label><textarea id="lab-reference-code" name="referenceCode" class="code" rows="12" maxlength="32000" required></textarea></div>
    ${widget}<button type="submit">Create Python Lab</button>
  </form>`;
}

export function renderLabStatus(lab: PythonLabRecord): string {
  if (lab.state === 'generating') {
    return `<p>Your test inputs are being prepared. Refresh this page shortly.</p>`;
  }
  if (lab.state === 'failed') {
    return `<p class="notice">${
      escapeHtml(lab.failureMessage ?? 'Python Lab generation failed.')
    }</p>`;
  }
  if (lab.state !== 'ready') {
    return `<p class="notice">This Python Lab has expired.</p>`;
  }
  return `<p>Python function contract: <code>${
    escapeHtml(lab.authorDraft.functionName)
  }(...)</code>. Public tests and hidden final checks are ready.</p>
    <div class="actions"><form method="post" action="${
    labUrl(lab.labId)
  }/preview"><button type="submit">Learner preview</button></form><a class="command" href="#candidate">Verify candidate</a></div>
    ${renderCandidatePage(lab, lab.authorDraft.starterCode, null)}
    <section id="canvas-access"><h2>Canvas access</h2><form method="post" action="${
    labUrl(lab.labId)
  }/access-requests" class="lab-form compact"><div class="field"><label for="canvas-request-name">Name</label><input id="canvas-request-name" name="name" maxlength="160" autocomplete="name" required></div><div class="field"><label for="canvas-request-email">Work email</label><input id="canvas-request-email" name="workEmail" type="email" maxlength="254" autocomplete="email" required></div><div class="field"><label for="canvas-request-institution">Institution</label><input id="canvas-request-institution" name="institution" maxlength="240" autocomplete="organization" required></div><button type="submit">Request Canvas access</button></form></section>`;
}

export function renderCandidatePage(
  lab: PythonLabRecord,
  source: string,
  result: Awaited<ReturnType<typeof verifyPythonLabCandidate>> | null,
): string {
  const resultHtml = result === null
    ? ''
    : `<ul>${
      result.publicOutcomes.map((outcome) =>
        `<li>${escapeHtml(outcome.label)}: ${escapeHtml(outcome.status)}${
          outcome.message === null ? '' : ` (${escapeHtml(outcome.message)})`
        }</li>`
      ).join('')
    }</ul><p>Hidden tests: ${result.hiddenSummary?.passed ?? 0} / ${
      result.hiddenSummary?.total ?? 0
    }. Score: ${result.scoreGiven ?? 0} / ${result.scoreMaximum ?? 10}.</p>`;
  return `<section id="candidate"><h2>Verify a candidate submission</h2><form method="post" action="${
    labUrl(lab.labId)
  }/candidate-runs" class="lab-form"><div class="field"><label for="candidate-source">Candidate solution</label><textarea id="candidate-source" name="source" class="code" rows="12" maxlength="32000" required>${
    escapeHtml(source)
  }</textarea></div><button type="submit">Run assignment contract</button></form>${resultHtml}</section>`;
}

export function renderPythonLabPage(input: {
  readonly title: string;
  readonly heading: string;
  readonly body: string;
  readonly notice?: string;
}): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${
    escapeHtml(input.title)
  }</title><style>
    :root{font-family:ui-sans-serif,system-ui,sans-serif;color:#14283b;background:#eef4f7}*{box-sizing:border-box}body{margin:0}.shell{width:min(880px,calc(100% - 32px));margin:0 auto;padding:38px 0 56px}header{border-bottom:1px solid #c9d7e0;padding-bottom:18px;margin-bottom:24px}h1{font-size:1.8rem;letter-spacing:0;margin:0 0 8px}h2{font-size:1.1rem;letter-spacing:0;margin:28px 0 12px}p{line-height:1.55;color:#40586b}.lab-form{display:grid;gap:15px;background:#fff;border:1px solid #c9d7e0;border-radius:6px;padding:18px}.lab-form .field{display:grid;gap:6px}.lab-form label{font-weight:700}.lab-form input,.lab-form textarea{border:1px solid #8ea5b5;border-radius:4px;padding:10px;font:inherit;color:#14283b}.lab-form textarea.code{font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;tab-size:4}.lab-form input:focus,.lab-form textarea:focus,button:focus-visible,a:focus-visible{outline:3px solid #eab308;outline-offset:2px}button,.command{display:inline-flex;align-items:center;justify-content:center;min-height:40px;width:max-content;border:1px solid #155e75;border-radius:4px;background:#155e75;color:#fff;padding:0 14px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.actions form{margin:0}.notice{border-left:4px solid #a14b12;padding-left:12px}.compact{max-width:520px}@media(max-width:600px){.shell{width:min(100% - 24px,880px);padding-top:22px}.lab-form{padding:14px}}
  </style></head><body><main class="shell"><header><p>Lantern Lab</p><h1>${
    escapeHtml(input.heading)
  }</h1></header>${
    input.notice ? `<p class="notice">${escapeHtml(input.notice)}</p>` : ''
  }${input.body}</main></body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

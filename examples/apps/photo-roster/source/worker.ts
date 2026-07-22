import {
  createLanternLmsClient,
  type LanternLmsCapabilityBinding,
  type RosterMember,
} from '../../../../sdk/worker-app-sdk.ts';

interface PhotoRosterEnv {
  readonly LANTERN_LMS: LanternLmsCapabilityBinding;
}

export default {
  async fetch(request: Request, env: PhotoRosterEnv): Promise<Response> {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const lms = createLanternLmsClient({
      request,
      binding: env.LANTERN_LMS,
    });
    const result = await lms.listRoster({
      fields: ['email', 'photo'],
      ...(cursor === undefined ? {} : { cursor }),
    });

    if (!result.ok) {
      return htmlResponse(renderFailure(result.error.code, result.error.traceId), 403);
    }

    return htmlResponse(renderRoster(result.value.members, result.value.nextCursor), 200);
  },
};

function renderRoster(members: readonly RosterMember[], nextCursor: string | undefined): string {
  const cards = members.map((member) => {
    const photo = member.photo === undefined
      ? `<span class="avatar" aria-hidden="true">${escapeHtml(initials(member.displayName))}</span>`
      : `<img class="avatar" src="${
        escapeAttribute(member.photo.url)
      }" alt="" width="64" height="64" loading="lazy" decoding="async" fetchpriority="low">`;
    const email = member.email === undefined
      ? '<span class="muted">Email not shared</span>'
      : `<a href="mailto:${escapeAttribute(member.email)}">${escapeHtml(member.email)}</a>`;
    return `<li class="card">
      ${photo}
      <div>
        <h2>${escapeHtml(member.displayName)}</h2>
        <p>${escapeHtml(member.roles.map(roleLabel).join(', '))}</p>
        <p>${email}</p>
      </div>
    </li>`;
  }).join('');
  const next = nextCursor === undefined
    ? ''
    : `<a class="next" href="?cursor=${encodeURIComponent(nextCursor)}">Next page</a>`;

  return page(`
    <header>
      <p class="eyebrow">Current LMS course</p>
      <h1>Photo Roster</h1>
      <p>${members.length} people on this page</p>
    </header>
    <ul class="roster">${cards}</ul>
    <nav aria-label="Roster pages">${next}</nav>
  `);
}

function renderFailure(code: string, traceId: string): string {
  const message = code === 'permission_denied'
    ? 'An institution administrator must approve this access, and the LMS launch must provide Names and Roles Provisioning.'
    : code === 'session_expired'
    ? 'This launch has expired. Open Photo Roster from the LMS again.'
    : code === 'rate_limited'
    ? 'The LMS is limiting roster requests. Try again shortly.'
    : 'The LMS roster is unavailable right now.';
  return page(`
    <section class="notice" role="alert">
      <h1>Photo Roster could not open</h1>
      <p>${message}</p>
      <p class="trace">Trace ${escapeHtml(traceId)}</p>
    </section>
  `);
}

function page(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Roster</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; color:#172635; background:#f4f7f8; }
    * { box-sizing:border-box; }
    body { margin:0; }
    main { width:min(1080px, calc(100% - 32px)); margin:auto; padding:32px 0 56px; }
    header { padding-bottom:20px; border-bottom:1px solid #cad5dc; }
    h1 { margin:4px 0 6px; font-size:clamp(1.8rem,4vw,2.5rem); }
    .eyebrow { color:#27566f; font-weight:700; letter-spacing:.08em; text-transform:uppercase; font-size:.75rem; }
    p { margin:4px 0; color:#526675; }
    .roster { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; padding:20px 0; margin:0; list-style:none; }
    .card { display:grid; grid-template-columns:64px 1fr; gap:14px; align-items:center; min-height:96px; padding:16px; background:white; border:1px solid #d3dde3; border-radius:8px; }
    .avatar { width:64px; height:64px; border-radius:50%; object-fit:cover; display:grid; place-items:center; background:#d9e8ef; color:#19485f; font-weight:750; font-size:1.1rem; }
    h2 { margin:0 0 4px; font-size:1rem; }
    a { color:#075985; overflow-wrap:anywhere; }
    a:focus-visible { outline:3px solid #eab308; outline-offset:3px; }
    .muted { color:#71828d; }
    .next { display:inline-block; padding:10px 14px; border:1px solid #075985; border-radius:5px; background:white; font-weight:700; text-decoration:none; }
    .notice { max-width:640px; padding:24px; background:white; border:1px solid #d3dde3; border-left:5px solid #b45309; border-radius:6px; }
    .trace { margin-top:18px; font:12px ui-monospace, monospace; }
    @media (max-width:520px) { main { width:min(100% - 20px,1080px); padding-top:20px; } .roster { grid-template-columns:1fr; } }
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'private, no-store',
    },
  });
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1).toUpperCase()).join('');
}

function roleLabel(role: RosterMember['roles'][number]): string {
  switch (role) {
    case 'administrator':
      return 'Administrator';
    case 'instructor':
      return 'Instructor';
    case 'learner':
      return 'Learner';
    case 'other':
      return 'Other';
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

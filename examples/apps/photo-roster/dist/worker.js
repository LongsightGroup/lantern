function p(e,r){let i=e.headers.get("x-lantern-runtime-page-url");if(i===null)return null;let t=new URL(i,"https://reviewed-app.internal");return t.searchParams.set("cursor",r),`${t.pathname}${t.search}`}function c(e){let r=e.request.headers.get("x-lantern-runtime-session-id"),i=e.request.headers.get("x-lantern-runtime-session-token"),t=e.request.headers.get("x-lantern-trace-id");return{listRoster(n){return!r||!i?Promise.resolve({ok:!1,error:{code:"session_expired",traceId:crypto.randomUUID()}}):e.binding.listRoster({runtimeSessionId:r,runtimeSessionToken:i,...t===null?{}:{traceId:t},request:n})}}}var b={async fetch(e,r){let t=new URL(e.url).searchParams.get("cursor")??void 0,o=await c({request:e,binding:r.LANTERN_LMS}).listRoster({fields:["email","photo"],...t===void 0?{}:{cursor:t}});if(!o.ok)return l(u(o.error.code,o.error.traceId),403);let a=o.value.nextCursor===void 0?void 0:p(e,o.value.nextCursor);return a===null?l(u("session_expired",e.headers.get("x-lantern-trace-id")??crypto.randomUUID()),403):l(g(o.value.members,a),200)}};function g(e,r){let i=e.map(n=>{let o=n.photo===void 0?`<span class="avatar" aria-hidden="true">${s(h(n.displayName))}</span>`:`<img class="avatar" src="${d(n.photo.url)}" alt="" width="64" height="64" loading="lazy" decoding="async" fetchpriority="low">`,a=n.email===void 0?'<span class="muted">Email not shared</span>':`<a href="mailto:${d(n.email)}">${s(n.email)}</a>`;return`<li class="card">
      ${o}
      <div>
        <h2>${s(n.displayName)}</h2>
        <p>${s(n.roles.map(x).join(", "))}</p>
        <p>${a}</p>
      </div>
    </li>`}).join(""),t=r===void 0?"":`<a class="next" href="${d(r)}">Next page</a>`;return m(`
    <header>
      <p class="eyebrow">Current LMS course</p>
      <h1>Photo Roster</h1>
      <p>${e.length} people on this page</p>
    </header>
    <ul class="roster">${i}</ul>
    <nav aria-label="Roster pages">${t}</nav>
  `)}function u(e,r){return m(`
    <section class="notice" role="alert">
      <h1>Photo Roster could not open</h1>
      <p>${e==="permission_denied"?"An institution administrator must approve this access, and the LMS launch must provide Names and Roles Provisioning.":e==="session_expired"?"This launch has expired. Open Photo Roster from the LMS again.":e==="rate_limited"?"The LMS is limiting roster requests. Try again shortly.":"The LMS roster is unavailable right now."}</p>
      <p class="trace">Trace ${s(r)}</p>
    </section>
  `)}function m(e){return`<!doctype html>
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
<body><main>${e}</main></body>
</html>`}function l(e,r){return new Response(e,{status:r,headers:{"content-type":"text/html; charset=UTF-8","cache-control":"private, no-store"}})}function h(e){return e.split(/\s+/).slice(0,2).map(r=>r.slice(0,1).toUpperCase()).join("")}function x(e){switch(e){case"administrator":return"Administrator";case"instructor":return"Instructor";case"learner":return"Learner";case"other":return"Other"}}function s(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}function d(e){return s(e)}export{b as default};

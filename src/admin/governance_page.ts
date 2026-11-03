import type { PackageVersionRecord } from '../package_review/types.ts';
import type {
  AppInstallationRecord,
  CapabilityGrantRecord,
  GovernanceEventRecord,
  InstitutionMembershipRecord,
  InstitutionRecord,
  LmsConnectionRecord,
  LmsContextRecord,
} from '../lms_kernel/types.ts';
import { type AdminIdentity, escapeHtml, formatDateTime, renderAdminLayout } from './layout.ts';

export function renderInstitutionOnboardingPage(input: {
  readonly identity: AdminIdentity;
  readonly error?: string;
}): string {
  return renderAdminLayout({
    identity: input.identity,
    title: 'Create institution · Lantern',
    eyebrow: 'Institution setup',
    heading: 'Create your institution',
    intro:
      'This institution owns LMS connections, app installations, permission decisions, and audit history.',
    activePath: '/admin/governance',
    notice:
      input.error === undefined
        ? null
        : { tone: 'error', title: 'Institution was not created', detail: input.error },
    body: `<section class="panel"><form class="panel-body stack" method="post" action="/admin/onboarding">
      <label>Institution name
        <input name="name" required minlength="2" maxlength="120" autocomplete="organization">
      </label>
      <div class="button-row"><button class="button-primary" type="submit">Create institution</button></div>
    </form></section>`,
  });
}

export function renderInviteAcceptancePage(input: {
  readonly identity: AdminIdentity;
  readonly token: string;
}): string {
  return renderAdminLayout({
    identity: input.identity,
    title: 'Accept institution invitation · Lantern',
    eyebrow: 'Institution invitation',
    heading: 'Join this institution?',
    intro:
      'Accepting consumes this one-time invitation and adds your account with the role chosen by the institution.',
    activePath: '/admin/governance',
    notice: null,
    body: `<section class="panel"><form class="panel-body stack" method="post" action="/admin/invites/${encodeURIComponent(
      input.token,
    )}/accept">
      <div class="button-row"><button class="button-primary" type="submit">Accept invitation</button></div>
    </form></section>`,
  });
}

export function renderGovernancePage(input: {
  readonly identity: AdminIdentity;
  readonly publicOrigin: string;
  readonly institution: InstitutionRecord;
  readonly membership: InstitutionMembershipRecord;
  readonly connections: readonly LmsConnectionRecord[];
  readonly hasSyntheticConnection: boolean;
  readonly contexts: readonly LmsContextRecord[];
  readonly installations: readonly AppInstallationRecord[];
  readonly packages: readonly PackageVersionRecord[];
  readonly grants: ReadonlyMap<string, readonly CapabilityGrantRecord[]>;
  readonly events: readonly GovernanceEventRecord[];
  readonly invite?: { readonly token: string; readonly expiresAt: string };
  readonly notice?: { readonly tone: 'error' | 'success'; readonly detail: string };
}): string {
  const packageById = new Map(input.packages.map((item) => [item.id, item]));
  const canGovern = input.membership.role === 'owner' || input.membership.role === 'admin';
  const body = [
    renderInstitutionSummary(input.institution, input.membership),
    input.invite === undefined ? '' : renderInvite(input.invite),
    renderConnections(input.connections, canGovern, input.publicOrigin),
    renderInstallations({
      installations: input.installations,
      packages: input.packages,
      packageById,
      contexts: input.contexts,
      grants: input.grants,
      canGovern,
      hasSyntheticConnection: input.hasSyntheticConnection,
      publicOrigin: input.publicOrigin,
    }),
    canGovern ? renderInviteForm() : '',
    renderEvents(input.events, input.connections, input.installations),
  ].join('');
  return renderAdminLayout({
    identity: input.identity,
    title: `${input.institution.name} governance · Lantern`,
    eyebrow: 'Governed LMS',
    heading: input.institution.name,
    intro:
      'Institution-owned LMS connections, reviewed app installations, explicit capability grants, and append-only decisions.',
    activePath: '/admin/governance',
    notice:
      input.notice === undefined
        ? null
        : {
            tone: input.notice.tone,
            title: input.notice.tone === 'success' ? 'Saved' : 'Action blocked',
            detail: input.notice.detail,
          },
    body,
  });
}

function renderInstitutionSummary(
  institution: InstitutionRecord,
  membership: InstitutionMembershipRecord,
): string {
  return `<section class="panel"><div class="panel-body table-row-meta">
    <span><strong>Institution</strong> ${escapeHtml(institution.slug)}</span>
    <span><strong>Your role</strong> ${escapeHtml(membership.role)}</span>
    <span><strong>Status</strong> ${escapeHtml(institution.status)}</span>
  </div></section>`;
}

function renderConnections(
  connections: readonly LmsConnectionRecord[],
  canGovern: boolean,
  publicOrigin: string,
): string {
  const rows =
    connections.length === 0
      ? '<p>No LMS connections yet.</p>'
      : connections
          .map(
            (connection) =>
              `<article class="table-row"><div class="table-row-top"><div>
        <p class="line-title">${escapeHtml(connection.label)}</p>
        <p class="line-copy">${escapeHtml(connection.platformType)} · ${escapeHtml(
          connection.issuer,
        )}</p>
        ${renderPlatformDiagnostic(connection)}
      </div><span class="status-badge status-${
        connection.status === 'active' ? 'approved' : 'pending'
      }">${escapeHtml(connection.status)}</span></div>
      <div class="table-row-meta">
        <span><strong>Client</strong> ${escapeHtml(connection.clientId)}</span>
        <span><strong>Deployment</strong> ${escapeHtml(connection.deploymentId)}</span>
        <span><strong>Approved embedding origin</strong> ${escapeHtml(connection.lmsOrigin)}</span>
        <span><strong>Validated</strong> ${escapeHtml(
          formatDateTime(connection.validatedAt),
        )}</span>
      </div>
      ${
        canGovern && connection.status !== 'disabled'
          ? `<form method="post" action="/admin/governance/connections/${escapeHtml(
              connection.id,
            )}/disable"><button class="button-ghost" type="submit">Disable connection</button></form>`
          : ''
      }</article>`,
          )
          .join('');
  return `<section class="panel"><div class="panel-body stack">
    <div><p class="section-label">LMS boundary</p><h2>Connections</h2>
    <p>Canvas, Moodle, Brightspace, and Sakai remain pending until a signed launch validates the registration. Synthetic activates immediately.</p></div>
    <dl>
      <dt>OIDC login URL</dt><dd><code>${escapeHtml(`${publicOrigin}/lti/login`)}</code></dd>
      <dt>Redirect and launch URL</dt><dd><code>${escapeHtml(
        `${publicOrigin}/lti/launch`,
      )}</code></dd>
      <dt>JWKS URL</dt><dd><code>${escapeHtml(`${publicOrigin}/lti/jwks.json`)}</code></dd>
      <dt>Required NRPS scope</dt><dd><code>https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly</code></dd>
    </dl>
    <div class="table-list">${rows}</div>
    ${canGovern ? renderConnectionForm() : ''}
  </div></section>`;
}

function renderPlatformDiagnostic(connection: LmsConnectionRecord): string {
  switch (connection.platformType) {
    case 'canvas':
      return '<p>Canvas: enable the NRPS readonly scope on the Developer Key. Canvas privacy settings control which names, emails, and photos are returned; no REST token is used.</p>';
    case 'moodle':
      return '<p>Moodle: enable Names and Role Provisioning on the external tool. Lantern validates the service claim from a signed course launch and never derives the endpoint from the Moodle URL.</p>';
    case 'brightspace':
      return '<p>Brightspace: enable NRPS on both the registration and deployment. If the roster is incomplete, verify “Classlist including users not known to this deployment.”</p>';
    case 'sakai':
      return '<p>Sakai: enable the Names and Roles service and readonly membership scope for this registration.</p>';
    case 'synthetic':
      return '<p>Synthetic: deterministic paginated classlist using the same policy, cursor, media, and audit path.</p>';
  }
}

function renderConnectionForm(): string {
  return `<details><summary>Add LMS connection</summary>
    <form class="stack" method="post" action="/admin/governance/connections">
      <label>Label <input name="label" required maxlength="120"></label>
      <label>Platform <select name="platformType" required>
        <option value="synthetic">Synthetic</option>
        <option value="canvas">Canvas</option>
        <option value="moodle">Moodle</option>
        <option value="brightspace">Brightspace</option>
        <option value="sakai">Sakai</option>
      </select></label>
      <p>For a real LMS, enter the exact values issued by its LTI 1.3 registration.</p>
      <label>LMS course-page origin <input name="lmsOrigin" type="url" aria-describedby="lms-origin-help"></label>
      <p id="lms-origin-help">The HTTPS origin allowed to embed apps, for example https://courses.example.edu. Do not include a path. This can differ from the issuer or authorization host. Synthetic does not need this field.</p>
      <label>Issuer <input name="issuer" type="url"></label>
      <label>Client ID <input name="clientId"></label>
      <label>Deployment ID <input name="deploymentId"></label>
      <label>Authorization endpoint <input name="authorizationEndpoint" type="url"></label>
      <label>Token endpoint <input name="accessTokenUrl" type="url"></label>
      <label>Platform JWKS URL <input name="jwksUrl" type="url"></label>
      <div class="button-row"><button class="button-primary" type="submit">Save connection</button></div>
    </form>
  </details>`;
}

function renderInstallations(input: {
  readonly installations: readonly AppInstallationRecord[];
  readonly packages: readonly PackageVersionRecord[];
  readonly packageById: ReadonlyMap<number, PackageVersionRecord>;
  readonly contexts: readonly LmsContextRecord[];
  readonly grants: ReadonlyMap<string, readonly CapabilityGrantRecord[]>;
  readonly canGovern: boolean;
  readonly hasSyntheticConnection: boolean;
  readonly publicOrigin: string;
}): string {
  const rows =
    input.installations.length === 0
      ? '<p>No governed apps installed yet.</p>'
      : input.installations
          .map((installation) => {
            const packageVersion = input.packageById.get(installation.packageVersionId);
            const grants = input.grants.get(installation.id) ?? [];
            return `<article class="table-row" id="installation-${escapeHtml(
              installation.id,
            )}"><div class="table-row-top"><div>
        <p class="line-title">${escapeHtml(packageVersion?.title ?? installation.appId)}</p>
        <p class="line-copy">Exact reviewed version ${escapeHtml(
          packageVersion?.version ?? String(installation.packageVersionId),
        )}</p>
        ${
          packageVersion === undefined
            ? ''
            : `<p>Reviewed ${escapeHtml(formatDateTime(packageVersion.reviewedAt))}${
                packageVersion.reviewNotes === null
                  ? ''
                  : ` · ${escapeHtml(packageVersion.reviewNotes)}`
              }</p>`
        }
      </div><span class="status-badge status-${
        installation.status === 'active' ? 'approved' : 'pending'
      }">${escapeHtml(installation.status)}</span></div>
      ${renderCapabilityApprovals(
        installation,
        packageVersion,
        grants,
        input.contexts,
        input.canGovern,
      )}
      ${
        input.canGovern && installation.status !== 'active'
          ? `<form method="post" action="/admin/governance/installations/${escapeHtml(
              installation.id,
            )}/activate"><button class="button-primary" type="submit">Activate after approvals</button></form>`
          : ''
      }
      ${
        input.canGovern && input.hasSyntheticConnection && installation.status === 'active'
          ? `<form method="post" action="/admin/governance/installations/${escapeHtml(
              installation.id,
            )}/synthetic-launch"><button class="button-secondary" type="submit">Launch with synthetic LMS</button></form>`
          : ''
      }
      ${
        input.canGovern && installation.status !== 'disabled'
          ? `<form method="post" action="/admin/governance/installations/${escapeHtml(
              installation.id,
            )}/disable"><button class="button-ghost" type="submit">Disable app</button></form>`
          : ''
      }
      ${
        installation.status === 'active'
          ? `<p><strong>LMS target link URI</strong><br><code>${escapeHtml(
              `${input.publicOrigin}/lti/launch?installation_id=${encodeURIComponent(
                installation.id,
              )}`,
            )}</code></p>`
          : ''
      }
      </article>`;
          })
          .join('');
  const options = input.packages
    .filter((item) => item.approvalStatus === 'approved' && item.runtime.kind === 'worker')
    .map(
      (item) =>
        `<option value="${item.id}">${escapeHtml(item.title)} · ${escapeHtml(item.version)}</option>`,
    )
    .join('');
  return `<section class="panel"><div class="panel-body stack">
    <div><p class="section-label">Reviewed execution</p><h2>App installations</h2>
    <p>Changing a package version creates a new approval boundary. Grants never carry forward.</p></div>
    <div class="table-list">${rows}</div>
    ${
      input.canGovern && options !== ''
        ? `<form class="stack" method="post" action="/admin/governance/installations">
          <label>Reviewed Worker app <select name="packageVersionId" required>${options}</select></label>
          <div class="button-row"><button class="button-primary" type="submit">Install for review</button></div>
        </form>`
        : ''
    }
  </div></section>`;
}

function renderCapabilityApprovals(
  installation: AppInstallationRecord,
  packageVersion: PackageVersionRecord | undefined,
  grants: readonly CapabilityGrantRecord[],
  contexts: readonly LmsContextRecord[],
  canGovern: boolean,
): string {
  if (packageVersion === undefined) {
    return '<p>Reviewed package record is unavailable.</p>';
  }
  return `<div class="stack">${packageVersion.capabilities
    .map((capability) => {
      const matching = grants.filter((grant) => grant.capability === capability);
      const active = matching.filter((grant) => grant.revokedAt === null);
      const grantRows = matching
        .map(
          (grant) =>
            `<li id="grant-${escapeHtml(grant.id)}">${escapeHtml(
              grant.scope.kind === 'institution'
                ? 'All institution contexts'
                : grant.scope.lmsContextId,
            )}
      · approved by ${escapeHtml(grant.approvedByUserId)} at ${escapeHtml(
        formatDateTime(grant.approvedAt),
      )}
      · ${
        grant.revokedAt === null
          ? 'active'
          : `revoked ${escapeHtml(formatDateTime(grant.revokedAt))}`
      }
      ${
        canGovern && grant.revokedAt === null
          ? `<form class="inline-form" method="post" action="/admin/governance/grants/${escapeHtml(
              grant.id,
            )}/revoke"><button class="button-ghost" type="submit">Revoke</button></form>`
          : ''
      }</li>`,
        )
        .join('');
      return `<div><p><strong>${escapeHtml(capability)}</strong> · ${escapeHtml(
        capabilityFieldLabel(capability),
      )} · ${active.length > 0 ? 'approved' : 'approval required'}</p>
      ${grantRows === '' ? '' : `<ul>${grantRows}</ul>`}
      ${
        canGovern && active.length === 0
          ? renderGrantForm(installation.id, capability, contexts)
          : ''
      }
    </div>`;
    })
    .join('')}</div>`;
}

function capabilityFieldLabel(capability: string): string {
  switch (capability) {
    case 'lms.roster.members.read':
      return 'names, canonical roles, and status';
    case 'lms.roster.contact.read':
      return 'email addresses';
    case 'lms.roster.profile_photo.read':
      return 'proxied profile photos';
    default:
      return 'reviewed app capability';
  }
}

function renderGrantForm(
  installationId: string,
  capability: string,
  contexts: readonly LmsContextRecord[],
): string {
  const contextOptions = contexts
    .map(
      (context) =>
        `<option value="${escapeHtml(context.id)}">${escapeHtml(
          context.label ?? context.providerContextId,
        )}</option>`,
    )
    .join('');
  return `<form class="inline-form" method="post" action="/admin/governance/installations/${escapeHtml(
    installationId,
  )}/grants">
    <input type="hidden" name="capability" value="${escapeHtml(capability)}">
    <select name="scope">
      <option value="institution">All institution contexts</option>
      ${contextOptions}
    </select>
    <button class="button-secondary" type="submit">Approve</button>
  </form>`;
}

function renderInviteForm(): string {
  return `<section class="panel"><div class="panel-body stack">
    <div><p class="section-label">Administration</p><h2>Invite administrator or auditor</h2>
    <p>Lantern creates a one-time link. It does not send email.</p></div>
    <form class="inline-form" method="post" action="/admin/governance/invites">
      <select name="role"><option value="admin">Administrator</option><option value="auditor">Auditor</option></select>
      <button class="button-secondary" type="submit">Create invite link</button>
    </form>
  </div></section>`;
}

function renderInvite(invite: { readonly token: string; readonly expiresAt: string }): string {
  const path = `/admin/invites/${encodeURIComponent(invite.token)}`;
  return `<section class="panel"><div class="panel-body stack">
    <p class="section-label">One-time invitation</p>
    <p><a href="${escapeHtml(path)}">${escapeHtml(path)}</a></p>
    <p>Expires ${escapeHtml(
      formatDateTime(invite.expiresAt),
    )}. Copy this link now; Lantern stores only its hash.</p>
  </div></section>`;
}

function renderEvents(
  events: readonly GovernanceEventRecord[],
  connections: readonly LmsConnectionRecord[],
  installations: readonly AppInstallationRecord[],
): string {
  const rows =
    events.length === 0
      ? '<p>No governance events recorded yet.</p>'
      : events
          .map(
            (event) =>
              `<article class="table-row"><p class="line-title">${escapeHtml(event.eventType)}</p>
      <p class="line-copy">${escapeHtml(event.decision ?? 'execution')} · ${escapeHtml(
        event.outcome,
      )}${event.capability === null ? '' : ` · ${escapeHtml(event.capability)}`}</p>
      <div class="table-row-meta"><span><strong>Trace</strong> <a href="?traceId=${encodeURIComponent(
        event.traceId,
      )}">${escapeHtml(event.traceId)}</a></span><span>${escapeHtml(
        formatDateTime(event.occurredAt),
      )}</span>
      ${
        event.appInstallationId === null
          ? ''
          : `<a href="#installation-${escapeHtml(event.appInstallationId)}">Installation</a>`
      }
      ${
        event.capabilityGrantId === null
          ? ''
          : `<a href="#grant-${escapeHtml(event.capabilityGrantId)}">Grant</a>`
      }</div></article>`,
          )
          .join('');
  const connectionOptions = connections
    .map(
      (connection) =>
        `<option value="${escapeHtml(connection.id)}">${escapeHtml(connection.label)}</option>`,
    )
    .join('');
  const installationOptions = installations
    .map(
      (installation) =>
        `<option value="${escapeHtml(installation.id)}">${escapeHtml(installation.appId)}</option>`,
    )
    .join('');
  return `<section class="panel"><div class="panel-body stack">
    <div><p class="section-label">Append-only ledger</p><h2>Recent governance events</h2>
    <p>Roster payloads, names, emails, provider IDs, photo URLs, tokens, cursors, and media handles are excluded.</p></div>
    <form method="get" action="/admin/governance">
      <fieldset class="stack"><legend>Filter audit events</legend>
        <label for="audit-after">After <input id="audit-after" name="after" type="datetime-local"></label>
        <label for="audit-before">Before <input id="audit-before" name="before" type="datetime-local"></label>
        <label for="audit-connection">Connection <select id="audit-connection" name="connectionId"><option value="">Any connection</option>${connectionOptions}</select></label>
        <label for="audit-installation">Installation <select id="audit-installation" name="installationId"><option value="">Any installation</option>${installationOptions}</select></label>
        <label for="audit-capability">Capability <input id="audit-capability" name="capability"></label>
        <label for="audit-decision">Decision <select id="audit-decision" name="decision"><option value="">Any decision</option><option value="allowed">Allowed</option><option value="denied">Denied</option></select></label>
        <label for="audit-outcome">Outcome <select id="audit-outcome" name="outcome"><option value="">Any outcome</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="limited">Limited</option></select></label>
        <label for="audit-trace">Trace ID <input id="audit-trace" name="traceId"></label>
        <button class="button-secondary" type="submit">Filter audit events</button>
      </fieldset>
    </form>
    <div class="table-list">${rows}</div>
  </div></section>`;
}

import type { Context, Hono } from '@hono/hono';
import {
  renderGovernancePage,
  renderInstitutionOnboardingPage,
  renderInviteAcceptancePage,
} from './admin/governance_page.ts';
import { adminIdentityFromContext, getAdminSession } from './admin_auth/context.ts';
import type { AppServices } from './app_services.ts';

type GovernanceRouteServices = Pick<
  AppServices,
  'getLmsKernelRepository' | 'getRepository' | 'lmsKernelAdminService'
>;
import { getKernelAdminContext } from './lms_kernel/admin_context.ts';
import { parseRosterCapability } from './lms_kernel/capabilities.ts';
import type { CapabilityGrantRecord, LmsPlatformType } from './lms_kernel/types.ts';

export function registerAdminGovernanceRoutes(app: Hono, services: GovernanceRouteServices): void {
  app.get('/admin/onboarding', (context) =>
    context.html(renderInstitutionOnboardingPage({
      identity: adminIdentityFromContext(context),
    })));

  app.post('/admin/onboarding', async (context) => {
    const form = await context.req.raw.formData();
    const result = await services.lmsKernelAdminService.createInstitution({
      userId: getAdminSession(context).user.id,
      name: formString(form, 'name'),
    });
    if (!result.ok) {
      return context.html(
        renderInstitutionOnboardingPage({
          identity: adminIdentityFromContext(context),
          error: result.error.message,
        }),
        400,
      );
    }
    return context.redirect('/admin/governance', 303);
  });

  app.get('/admin/invites/:token', (context) =>
    context.html(renderInviteAcceptancePage({
      identity: adminIdentityFromContext(context),
      token: context.req.param('token'),
    })));

  app.post('/admin/invites/:token/accept', async (context) => {
    const result = await services.lmsKernelAdminService.acceptInvite({
      userId: getAdminSession(context).user.id,
      token: context.req.param('token'),
    });
    return result.ok
      ? context.redirect('/admin/governance', 303)
      : context.text(result.error.message, 400);
  });

  app.get('/admin/governance', (context) => renderDashboard(context, services));

  app.post('/admin/governance/connections', async (context) => {
    const form = await context.req.raw.formData();
    const platformType = parsePlatformType(formString(form, 'platformType'));
    if (platformType === null) {
      return await renderDashboard(context, services, 'Unsupported LMS platform.', 400);
    }
    const result = await services.lmsKernelAdminService.createConnection({
      membership: getKernelAdminContext(context).membership,
      label: formString(form, 'label'),
      platformType,
      lmsOrigin: formString(form, 'lmsOrigin'),
      issuer: formString(form, 'issuer'),
      clientId: formString(form, 'clientId'),
      deploymentId: formString(form, 'deploymentId'),
      authorizationEndpoint: formString(form, 'authorizationEndpoint'),
      accessTokenUrl: formString(form, 'accessTokenUrl'),
      jwksUrl: formString(form, 'jwksUrl'),
    });
    return result.ok
      ? context.redirect('/admin/governance', 303)
      : await renderDashboard(context, services, result.error.message, 400);
  });

  app.post('/admin/governance/connections/:connectionId/disable', async (context) => {
    const result = await services.lmsKernelAdminService.disableConnection({
      membership: getKernelAdminContext(context).membership,
      connectionId: context.req.param('connectionId'),
    });
    return result.ok
      ? context.redirect('/admin/governance', 303)
      : await renderDashboard(context, services, result.error.message, 400);
  });

  app.post('/admin/governance/installations', async (context) => {
    const form = await context.req.raw.formData();
    const packageVersionId = Number(formString(form, 'packageVersionId'));
    if (!Number.isSafeInteger(packageVersionId) || packageVersionId <= 0) {
      return await renderDashboard(context, services, 'Choose a reviewed package version.', 400);
    }
    const result = await services.lmsKernelAdminService.installApp({
      membership: getKernelAdminContext(context).membership,
      packageVersionId,
    });
    return result.ok
      ? context.redirect('/admin/governance', 303)
      : await renderDashboard(context, services, result.error.message, 400);
  });

  app.post('/admin/governance/installations/:installationId/grants', async (context) => {
    const form = await context.req.raw.formData();
    const capability = parseRosterCapability(formString(form, 'capability'));
    if (capability === null) {
      return await renderDashboard(context, services, 'Unsupported capability.', 400);
    }
    const scope = formString(form, 'scope');
    const result = await services.lmsKernelAdminService.grantCapability({
      membership: getKernelAdminContext(context).membership,
      installationId: context.req.param('installationId'),
      capability,
      lmsContextId: scope === 'institution' ? null : scope,
    });
    return result.ok
      ? context.redirect('/admin/governance', 303)
      : await renderDashboard(context, services, result.error.message, 400);
  });

  app.post('/admin/governance/installations/:installationId/activate', async (context) => {
    const result = await services.lmsKernelAdminService.activateInstallation({
      membership: getKernelAdminContext(context).membership,
      installationId: context.req.param('installationId'),
    });
    return result.ok
      ? context.redirect('/admin/governance', 303)
      : await renderDashboard(context, services, result.error.message, 409);
  });

  app.post('/admin/governance/installations/:installationId/synthetic-launch', async (context) => {
    const result = await services.lmsKernelAdminService.createSyntheticLaunch({
      membership: getKernelAdminContext(context).membership,
      installationId: context.req.param('installationId'),
    });
    if (!result.ok) {
      return await renderDashboard(context, services, result.error.message, 400);
    }
    const path = `/governed/sessions/${encodeURIComponent(result.value.runtimeSessionId)}` +
      `?token=${encodeURIComponent(result.value.runtimeSessionToken)}`;
    return context.redirect(path, 303);
  });

  app.post('/admin/governance/installations/:installationId/disable', async (context) => {
    const result = await services.lmsKernelAdminService.disableInstallation({
      membership: getKernelAdminContext(context).membership,
      installationId: context.req.param('installationId'),
    });
    return result.ok
      ? context.redirect('/admin/governance', 303)
      : await renderDashboard(context, services, result.error.message, 400);
  });

  app.post('/admin/governance/grants/:grantId/revoke', async (context) => {
    const result = await services.lmsKernelAdminService.revokeGrant({
      membership: getKernelAdminContext(context).membership,
      grantId: context.req.param('grantId'),
    });
    return result.ok
      ? context.redirect('/admin/governance', 303)
      : await renderDashboard(context, services, result.error.message, 400);
  });

  app.post('/admin/governance/invites', async (context) => {
    const form = await context.req.raw.formData();
    const role = formString(form, 'role');
    if (role !== 'admin' && role !== 'auditor') {
      return await renderDashboard(context, services, 'Choose administrator or auditor.', 400);
    }
    const result = await services.lmsKernelAdminService.createInvite({
      membership: getKernelAdminContext(context).membership,
      role,
    });
    return result.ok
      ? await renderDashboard(context, services, undefined, 200, result.value)
      : await renderDashboard(context, services, result.error.message, 400);
  });
}

async function renderDashboard(
  context: Context,
  services: GovernanceRouteServices,
  error?: string,
  status: 200 | 400 | 409 = 200,
  invite?: { readonly token: string; readonly expiresAt: string },
): Promise<Response> {
  const admin = getKernelAdminContext(context);
  const repository = services.getLmsKernelRepository();
  const [connections, contexts, installations, packages, events, grantRecords] = await Promise.all([
    repository.listLmsConnections(admin.institution.id),
    repository.listLmsContexts(admin.institution.id),
    repository.listInstallations(admin.institution.id),
    services.getRepository().listPackageVersions(),
    repository.listGovernanceEvents(buildGovernanceFilter(context, admin.institution.id)),
    repository.listCapabilityGrantsForInstitution(admin.institution.id),
  ]);
  const grants = new Map<string, CapabilityGrantRecord[]>();
  for (const installation of installations) {
    grants.set(installation.id, []);
  }
  for (const grant of grantRecords) {
    const existing = grants.get(grant.appInstallationId);
    if (existing === undefined) {
      grants.set(grant.appInstallationId, [grant]);
    } else {
      existing.push(grant);
    }
  }
  return context.html(
    renderGovernancePage({
      identity: adminIdentityFromContext(context),
      publicOrigin: new URL(context.req.url).origin,
      institution: admin.institution,
      membership: admin.membership,
      connections,
      hasSyntheticConnection: connections.some((connection) =>
        connection.platformType === 'synthetic' && connection.status === 'active'
      ),
      contexts,
      installations,
      packages,
      grants,
      events,
      ...(invite === undefined ? {} : { invite }),
      ...(error === undefined ? {} : { notice: { tone: 'error', detail: error } }),
    }),
    status,
  );
}

function buildGovernanceFilter(context: Context, institutionId: string) {
  const traceId = optionalQuery(context, 'traceId');
  const capability = optionalQuery(context, 'capability');
  const decision = parseDecision(optionalQuery(context, 'decision'));
  const outcome = parseOutcome(optionalQuery(context, 'outcome'));
  const lmsConnectionId = optionalQuery(context, 'connectionId');
  const appInstallationId = optionalQuery(context, 'installationId');
  const occurredAfter = parseDateTimeQuery(optionalQuery(context, 'after'));
  const occurredBefore = parseDateTimeQuery(optionalQuery(context, 'before'));
  return {
    institutionId,
    limit: 100,
    ...(traceId === undefined ? {} : { traceId }),
    ...(capability === undefined ? {} : { capability }),
    ...(decision === undefined ? {} : { decision }),
    ...(outcome === undefined ? {} : { outcome }),
    ...(lmsConnectionId === undefined ? {} : { lmsConnectionId }),
    ...(appInstallationId === undefined ? {} : { appInstallationId }),
    ...(occurredAfter === undefined ? {} : { occurredAfter }),
    ...(occurredBefore === undefined ? {} : { occurredBefore }),
  };
}

function parseDateTimeQuery(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function optionalQuery(context: Context, key: string): string | undefined {
  const value = context.req.query(key)?.trim();
  return value ? value : undefined;
}

function parsePlatformType(value: string): LmsPlatformType | null {
  return value === 'canvas' || value === 'moodle' || value === 'brightspace' ||
      value === 'sakai' || value === 'synthetic'
    ? value
    : null;
}

function parseDecision(value: string | undefined): 'allowed' | 'denied' | undefined {
  return value === 'allowed' || value === 'denied' ? value : undefined;
}

function parseOutcome(
  value: string | undefined,
): 'completed' | 'failed' | 'limited' | undefined {
  return value === 'completed' || value === 'failed' || value === 'limited' ? value : undefined;
}

import type { Hono } from '@hono/hono';
import {
  renderDeploymentsPage as renderDeploymentsResponse,
  renderVerificationPage as renderVerificationResponse,
} from './app_admin_support.ts';
import {
  renderDeploymentsPage as renderDeploymentsView,
  renderVerificationPage as renderVerificationView,
} from './admin/control_plane.ts';
import { createErrorNotice } from './app_notice_support.ts';
import { parseBrokerVerificationRunForm } from './app_request_support.ts';
import { statusForError, statusForVerificationError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';

export function registerAdminOperationsRoutes(app: Hono, services: AppServices): void {
  app.get('/admin/deployments', async (context) => {
    try {
      return await renderDeploymentsResponse(context, services);
    } catch (error) {
      return context.html(
        renderDeploymentsView({
          deployments: [],
          notice: createErrorNotice('Connections unavailable', error),
        }),
        statusForError(error),
      );
    }
  });

  app.get('/admin/verification', async (context) => {
    try {
      return await renderVerificationResponse(context, services);
    } catch (error) {
      return context.html(
        renderVerificationView({
          deployments: [],
          latestBrokerVerification: null,
          notice: createErrorNotice('Verification unavailable', error),
        }),
        statusForError(error),
      );
    }
  });

  app.post('/admin/verification', async (context) => {
    try {
      const verificationRun = parseBrokerVerificationRunForm(await context.req.formData());

      await services.getOpsRepository().recordBrokerVerificationRun(verificationRun);

      return context.redirect('/admin/verification', 303);
    } catch (error) {
      return await renderVerificationResponse(context, services, {
        notice: createErrorNotice('Verification update blocked', error),
        status: statusForVerificationError(error),
      });
    }
  });
}

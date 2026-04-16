import type { Hono } from '@hono/hono';
import {
  renderDeploymentsPage as renderDeploymentsResponse,
  renderVerificationPage as renderVerificationResponse,
} from './app_admin_support.ts';
import {
  renderDeploymentsPage as renderDeploymentsView,
  renderVerificationPage as renderVerificationView,
} from './admin/control_plane.ts';
import type { VerificationPageSection } from './admin/verification_navigation.ts';
import { createErrorNotice } from './app_notice_support.ts';
import {
  parseBrokerVerificationRunForm,
  parseLanternDefaultLtiProfileForm,
} from './app_request_support.ts';
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
    const section: VerificationPageSection = 'checklist';

    try {
      return await renderVerificationResponse(context, services, { section });
    } catch (error) {
      return context.html(
        renderVerificationView({
          deployments: [],
          latestBrokerVerification: null,
          ltiProfileSettings: null,
          section,
          notice: createErrorNotice('Verification unavailable', error),
        }),
        statusForError(error),
      );
    }
  });

  app.get('/admin/verification/official', async (context) => {
    const section: VerificationPageSection = 'official';

    try {
      return await renderVerificationResponse(context, services, { section });
    } catch (error) {
      return context.html(
        renderVerificationView({
          deployments: [],
          latestBrokerVerification: null,
          ltiProfileSettings: null,
          section,
          notice: createErrorNotice('Verification unavailable', error),
        }),
        statusForError(error),
      );
    }
  });

  app.get('/admin/verification/new', async (context) => {
    const section: VerificationPageSection = 'new';

    try {
      return await renderVerificationResponse(context, services, { section });
    } catch (error) {
      return context.html(
        renderVerificationView({
          deployments: [],
          latestBrokerVerification: null,
          ltiProfileSettings: null,
          section,
          notice: createErrorNotice('Verification unavailable', error),
        }),
        statusForError(error),
      );
    }
  });

  app.get('/admin/verification/lti-profile', async (context) => {
    const section: VerificationPageSection = 'profile';

    try {
      return await renderVerificationResponse(context, services, { section });
    } catch (error) {
      return context.html(
        renderVerificationView({
          deployments: [],
          latestBrokerVerification: null,
          ltiProfileSettings: null,
          section,
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

      return context.redirect(
        verificationRun.source === '1edtech'
          ? '/admin/verification/official'
          : '/admin/verification',
        303,
      );
    } catch (error) {
      return await renderVerificationResponse(context, services, {
        section: 'new',
        notice: createErrorNotice('Verification update blocked', error),
        status: statusForVerificationError(error),
      });
    }
  });

  app.post('/admin/verification/lti-profile', async (context) => {
    try {
      const defaultLtiProfile = parseLanternDefaultLtiProfileForm(await context.req.formData());

      await services.getRepository().saveLanternDefaultLtiProfile({
        defaultLtiProfile,
      });

      return context.redirect('/admin/verification/lti-profile', 303);
    } catch (error) {
      return await renderVerificationResponse(context, services, {
        section: 'profile',
        notice: createErrorNotice('Lantern default blocked', error),
        status: statusForVerificationError(error),
      });
    }
  });
}

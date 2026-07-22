import type { Hono } from '@hono/hono';
import { createErrorNotice } from './app_notice_support.ts';
import type { AppServices } from './app_services.ts';

type AdminPythonLabRouteServices = Pick<AppServices, 'pythonLabRepository'>;
import { adminPageInput } from './admin_auth/page_input.ts';
import { renderPythonLabRequestsPage } from './admin/python_lab_requests_page.ts';
import type { PythonLabRequestStatus } from './python_lab/repository.ts';

export function registerAdminPythonLabRoutes(
  app: Hono,
  services: AdminPythonLabRouteServices,
): void {
  app.get('/admin/python-lab-requests', async (context) => {
    try {
      return context.html(renderPythonLabRequestsPage(adminPageInput(context, {
        requests: await services.pythonLabRepository.listAccessRequests(),
      })));
    } catch (error) {
      return context.html(
        renderPythonLabRequestsPage(adminPageInput(context, {
          requests: [],
          notice: createErrorNotice('Python Lab requests unavailable', error),
        })),
        500,
      );
    }
  });

  app.post('/admin/python-lab-requests/:requestId', async (context) => {
    try {
      const requestId = context.req.param('requestId');

      if (requestId === undefined || requestId === '') {
        throw new Error('Python Lab access request was not found.');
      }

      const form = await context.req.formData();
      await services.pythonLabRepository.updateAccessRequestStatus({
        requestId,
        status: requireRequestStatus(form.get('status')),
        updatedAt: new Date().toISOString(),
      });

      return context.redirect('/admin/python-lab-requests', 303);
    } catch (error) {
      return context.html(
        renderPythonLabRequestsPage(adminPageInput(context, {
          requests: await services.pythonLabRepository.listAccessRequests(),
          notice: createErrorNotice('Python Lab request was not updated', error),
        })),
        400,
      );
    }
  });
}

function requireRequestStatus(value: FormDataEntryValue | null): PythonLabRequestStatus {
  if (value === 'new' || value === 'contacted' || value === 'closed') {
    return value;
  }

  throw new Error('Choose a valid Python Lab request status.');
}

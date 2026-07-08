import { csrf } from '@hono/hono/csrf';
import type { Context, Hono } from '@hono/hono';
import type { AppServices } from './app_services.ts';
import { renderAdminAuthPage, renderAdminLogoutPage } from './admin_auth/page.ts';

type AuthMode = 'login' | 'signup';

export function registerPublicAdminAuthRoutes(app: Hono, services: AppServices): void {
  app.on(
    ['GET', 'POST'],
    '/api/auth/*',
    (context) => services.adminAuth.handleAuthRequest(context.req.raw),
  );

  app.get('/admin/login', (context) => renderAuthPage(context, services, 'login'));
  app.post('/admin/login', csrf(), (context) => handleAuthForm(context, services, 'login'));

  app.get('/admin/signup', (context) => renderAuthPage(context, services, 'signup'));
  app.post('/admin/signup', csrf(), (context) => handleAuthForm(context, services, 'signup'));
}

export function registerProtectedAdminAuthRoutes(app: Hono, services: AppServices): void {
  app.get('/admin/logout', (context) => context.html(renderAdminLogoutPage()));

  app.post('/admin/logout', async (context) => {
    const result = await services.adminAuth.signOut({
      request: context.req.raw,
      returnTo: '/admin/login',
    });

    if (result.success) {
      return result.response;
    }

    return context.html(renderAdminLogoutPage(result.message), result.status);
  });
}

async function renderAuthPage(context: Context, services: AppServices, mode: AuthMode) {
  const returnTo = normalizeReturnTo(context.req.query('returnTo'));
  const session = await services.adminAuth.getSession(context.req.raw);

  if (session) {
    return context.redirect(returnTo, 303);
  }

  return context.html(renderAdminAuthPage({ mode, returnTo }));
}

async function handleAuthForm(context: Context, services: AppServices, mode: AuthMode) {
  const form = await context.req.raw.formData();
  const returnTo = normalizeReturnTo(readFormString(form, 'returnTo'));
  const values = readAuthFormValues(form, mode);
  const validationError = validateAuthForm(mode, values);

  if (validationError) {
    return context.html(
      renderAdminAuthPage({
        mode,
        returnTo,
        error: validationError,
        email: values.email,
        name: values.name,
      }),
      400,
    );
  }

  const result = mode === 'login'
    ? await services.adminAuth.signIn({
      request: context.req.raw,
      email: values.email,
      password: values.password,
      returnTo,
    })
    : await services.adminAuth.signUp({
      request: context.req.raw,
      name: values.name,
      email: values.email,
      password: values.password,
      returnTo,
    });

  if (result.success) {
    return result.response;
  }

  return context.html(
    renderAdminAuthPage({
      mode,
      returnTo,
      error: result.message,
      email: values.email,
      name: values.name,
    }),
    result.status,
  );
}

function readAuthFormValues(form: FormData, mode: AuthMode): {
  name: string;
  email: string;
  password: string;
} {
  return {
    name: mode === 'signup' ? readFormString(form, 'name').trim() : '',
    email: readFormString(form, 'email').trim(),
    password: readFormString(form, 'password'),
  };
}

function validateAuthForm(mode: AuthMode, values: {
  name: string;
  email: string;
  password: string;
}): string | null {
  if (mode === 'login') {
    return !values.email || !values.password ? 'Enter your email and password.' : null;
  }

  return !values.name || !values.email || !values.password
    ? 'Enter your name, email, and password.'
    : null;
}

function readFormString(form: FormData, name: string): string {
  const value = form.get(name);

  return typeof value === 'string' ? value : '';
}

function normalizeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/admin/') || value.startsWith('//')) {
    return '/admin/packages';
  }

  if (value === '/admin/login' || value.startsWith('/admin/login?')) {
    return '/admin/packages';
  }

  if (value === '/admin/signup' || value.startsWith('/admin/signup?')) {
    return '/admin/packages';
  }

  return value;
}

import { Hono } from '@hono/hono';
import { renderHomePage } from './pages/home.ts';

export const app = new Hono();

app.get('/', (context) => {
  return context.html(renderHomePage());
});

app.get('/health', (context) => {
  return context.json({ ok: true });
});

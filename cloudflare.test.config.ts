import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'lantern-worker-tests',
    entrypoint: './src/app_writer/platform_worker.ts',
    compatibilityDate: '2026-11-02',
    compatibilityFlags: ['nodejs_compat'],
    env: {
      DB: bindings.d1({ name: 'lantern-tests' }),
      BROWSER: bindings.browser(),
    },
  },
});

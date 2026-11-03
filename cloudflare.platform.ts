import { bindings, defineWorker } from 'cf/config';

/** Browser Rendering service used by Lantern's app generation gateway. */
export const appWriterPlatform = defineWorker({
  name: 'lantern-app-writer-platform-services',
  entrypoint: './src/app_writer/platform_worker.ts',
  compatibilityDate: '2026-11-02',
  compatibilityFlags: ['nodejs_compat'],
  env: { BROWSER: bindings.browser() },
});

import { createCloudflareBrowserAppPackagePreviewer } from './cloudflare_browser_preview.ts';
import { createAppWriterPlatformServicesHandler } from './platform_services.ts';
import { createUnavailableAppPackagePreviewer } from './preview.ts';
import { createTypeScriptAppPackageSourceCompiler } from './typescript_source_compiler.ts';

interface PlatformWorkerEnv {
  BROWSER?: unknown;
}

const sourceCompiler = createTypeScriptAppPackageSourceCompiler();

export default {
  fetch(request: Request, env: PlatformWorkerEnv): Promise<Response> {
    return createAppWriterPlatformServicesHandler({
      sourceCompiler,
      previewer:
        env.BROWSER === undefined
          ? createUnavailableAppPackagePreviewer(
              'Lantern app package preview requires a Cloudflare Browser Rendering binding named BROWSER.',
            )
          : createCloudflareBrowserAppPackagePreviewer({
              browser: env.BROWSER,
            }),
    }).fetch(request);
  },
};

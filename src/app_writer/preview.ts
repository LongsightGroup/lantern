import type { AppPackagePreviewer } from './types.ts';

export function createUnavailableAppPackagePreviewer(
  message = APP_PACKAGE_PREVIEWER_UNAVAILABLE_MESSAGE,
): AppPackagePreviewer {
  return {
    preview(_input) {
      return Promise.reject(new Error(message));
    },
  };
}

export const APP_PACKAGE_PREVIEWER_UNAVAILABLE_MESSAGE =
  'Lantern app package preview is not configured. Bind a platform-owned previewer before saving generated apps.';

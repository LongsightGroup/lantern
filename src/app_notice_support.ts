import type { AdminNotice } from "./admin/layout.ts";
import { buildCanvasConfigUrl } from "./lti/config.ts";
import { errorMessage } from "./app_status_support.ts";

export function createErrorNotice(title: string, error: unknown): AdminNotice {
  const message = errorMessage(error);
  const items = message.includes("; ") ? message.split("; ") : [];

  return {
    tone: "error",
    title,
    detail: items.length > 0
      ? "Resolve the listed issues and try again."
      : message,
    ...(items.length > 0 ? { items } : {}),
  };
}

export function combineNotices(
  primary: AdminNotice | null,
  secondary: AdminNotice,
): AdminNotice {
  if (primary === null) {
    return secondary;
  }

  return {
    tone: secondary.tone,
    title: secondary.title,
    detail: secondary.detail,
    items: [
      ...(secondary.items ?? []),
      primary.detail,
      ...(primary.items ?? []),
    ],
  };
}

export function getCanvasConfigUrlNoticeSafe(appOrigin?: string): {
  url: string | null;
  notice: AdminNotice | null;
} {
  try {
    return {
      url: buildCanvasConfigUrl(appOrigin),
      notice: null,
    };
  } catch (error) {
    return {
      url: null,
      notice: createErrorNotice("Canvas config unavailable", error),
    };
  }
}

export function packageDetailPath(appId: string, version: string): string {
  return `/admin/packages/${appId}/versions/${version}`;
}

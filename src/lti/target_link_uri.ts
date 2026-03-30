import { buildCanvasDeepLinkingUrl, buildCanvasLaunchUrl } from "./config.ts";

export type LanternTargetLinkKind = "launch" | "deep_linking";

export function resolveLanternTargetLinkKind(
  value: string,
): LanternTargetLinkKind | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  switch (normalizePathname(url.pathname)) {
    case "/lti/launch":
      return "launch";
    case "/lti/deep-linking":
      return "deep_linking";
    default:
      return null;
  }
}

export function targetLinkUrisMatch(input: {
  expected: string;
  actual: string;
}): boolean {
  const expected = parseAbsoluteUrl(input.expected);
  const actual = parseAbsoluteUrl(input.actual);

  if (!expected || !actual) {
    return false;
  }

  const expectedKind = resolveLanternTargetLinkKind(expected.toString());
  const actualKind = resolveLanternTargetLinkKind(actual.toString());

  if (expectedKind !== null && actualKind !== null) {
    return expectedKind === actualKind &&
      expected.hostname === actual.hostname;
  }

  return expected.hostname === actual.hostname &&
    normalizePathname(expected.pathname) === normalizePathname(actual.pathname);
}

export function assertLanternTargetLinkKind(input: {
  targetLinkUri: string;
  kind: LanternTargetLinkKind;
  message: string;
}): void {
  const kind = resolveLanternTargetLinkKind(input.targetLinkUri);

  if (kind !== input.kind) {
    throw new Error(input.message);
  }
}

export function buildLanternTargetLinkUri(
  kind: LanternTargetLinkKind,
  appOrigin?: string,
): string {
  return kind === "launch"
    ? buildCanvasLaunchUrl(appOrigin)
    : buildCanvasDeepLinkingUrl(appOrigin);
}

function parseAbsoluteUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

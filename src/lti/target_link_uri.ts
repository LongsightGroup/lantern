import { buildCanvasDeepLinkingUrl, buildCanvasLaunchUrl } from './config.ts';
import {
  LTI_ASSIGNMENT_SELECTION_PLACEMENT,
  LTI_RESOURCE_SELECTION_PLACEMENT,
  type LtiPlacement,
} from './types.ts';

export type LanternTargetLinkKind = 'launch' | 'deep_linking';

export function resolveLanternTargetLinkKind(value: string): LanternTargetLinkKind | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  switch (normalizePathname(url.pathname)) {
    case '/lti/launch':
      return 'launch';
    case '/lti/deep-linking':
      return 'deep_linking';
    default:
      return null;
  }
}

export function targetLinkUrisMatch(input: {
  expected: string;
  actual: string;
  allowLanternDrift?: boolean;
}): boolean {
  const expected = parseAbsoluteUrl(input.expected);
  const actual = parseAbsoluteUrl(input.actual);

  if (!expected || !actual) {
    return false;
  }

  if (input.allowLanternDrift === false) {
    return expected.toString() === actual.toString();
  }

  const expectedKind = resolveLanternTargetLinkKind(expected.toString());
  const actualKind = resolveLanternTargetLinkKind(actual.toString());

  if (expectedKind !== null && actualKind !== null) {
    if (expectedKind === 'deep_linking' && actualKind === 'deep_linking') {
      const expectedPlacement = resolveLanternDeepLinkingPlacement(expected.toString());
      const actualPlacement = resolveLanternDeepLinkingPlacement(actual.toString());

      return (
        expected.hostname === actual.hostname &&
        expectedPlacement !== null &&
        actualPlacement !== null &&
        expectedPlacement === actualPlacement
      );
    }

    return expectedKind === actualKind && expected.hostname === actual.hostname;
  }

  return (
    expected.hostname === actual.hostname &&
    normalizePathname(expected.pathname) === normalizePathname(actual.pathname)
  );
}

export function targetLinkUriUsesLanternDriftTolerance(input: {
  expected: string;
  actual: string;
}): boolean {
  return (
    targetLinkUrisMatch({
      expected: input.expected,
      actual: input.actual,
      allowLanternDrift: true,
    }) &&
    !targetLinkUrisMatch({
      expected: input.expected,
      actual: input.actual,
      allowLanternDrift: false,
    })
  );
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

export function resolveLanternDeepLinkingPlacement(targetLinkUri: string): LtiPlacement | null {
  const url = parseAbsoluteUrl(targetLinkUri);

  if (!url || resolveLanternTargetLinkKind(url.toString()) !== 'deep_linking') {
    return null;
  }

  const placement = url.searchParams.get('placement');

  if (placement === null || placement.trim() === '') {
    return LTI_ASSIGNMENT_SELECTION_PLACEMENT;
  }

  if (
    placement === LTI_ASSIGNMENT_SELECTION_PLACEMENT ||
    placement === LTI_RESOURCE_SELECTION_PLACEMENT
  ) {
    return placement;
  }

  return null;
}

export function buildLanternTargetLinkUri(kind: LanternTargetLinkKind, appOrigin?: string): string {
  return kind === 'launch' ? buildCanvasLaunchUrl(appOrigin) : buildCanvasDeepLinkingUrl(appOrigin);
}

function parseAbsoluteUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

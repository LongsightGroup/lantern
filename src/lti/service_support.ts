import type { NrpsMembership } from './services.ts';

export interface ParsedLineItem {
  lineItemUrl: string;
  resourceLinkId: string;
  resourceId: string;
  tag: string;
  label: string;
  scoreMaximum: number;
}

export function parseLineItemCollection(value: unknown): ParsedLineItem[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Canvas line item lookup must return an array.');
  }

  return value.map((item, index) => mapLineItem(item, index));
}

export function mapMembership(value: unknown, index: number): NrpsMembership {
  const record = requireRecord(value, `Canvas NRPS member ${index} must be an object.`);
  const userId = valueAsString(record.user_id);
  const name = valueAsString(record.name);
  const email = valueAsString(record.email);
  const status = valueAsString(record.status);
  const rolesValue = record.roles;

  return {
    userId: userId === null ? null : userId.trim(),
    roles: Array.isArray(rolesValue)
      ? rolesValue.filter((role): role is string => typeof role === 'string' && role.trim() !== '')
      : [],
    status: status === null ? null : status.trim(),
    name: name === null ? null : name.trim(),
    email: email === null ? null : email.trim(),
  };
}

export async function readJsonResponse(response: Response, message: string): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`${message} Status ${response.status}.`);
  }

  return await response.json();
}

export async function readMaybeJson(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();

  if (text.trim() === '') {
    return null;
  }

  const parsed = JSON.parse(text) as unknown;

  return requireRecord(parsed, 'Canvas response body must be an object.');
}

export function parseNextLink(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  for (const part of headerValue.split(',')) {
    const trimmed = part.trim();

    if (!trimmed.includes('rel="next"')) {
      continue;
    }

    const match = trimmed.match(/^<([^>]+)>/);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export function resolveCanvasTokenEndpoint(authorizationEndpoint: string): string {
  const url = new URL(authorizationEndpoint);

  url.pathname = '/login/oauth2/token';
  url.search = '';

  return url.toString();
}

export function toLineItemsUrl(lineItemUrl: string): string {
  const url = new URL(lineItemUrl);
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length < 2) {
    throw new Error('Canvas lineitem URL could not be resolved to lineitems.');
  }

  segments.pop();
  url.pathname = `/${segments.join('/')}`;
  url.search = '';

  return url.toString();
}

export function toScoresUrl(lineItemUrl: string): string {
  return `${lineItemUrl.replace(/\/$/, '')}/scores`;
}

export function requireTrimmedString(value: string | null, message: string): string {
  if (value === null || value.trim() === '') {
    throw new Error(message);
  }

  return value.trim();
}

export function uniqueTrimmedStrings(values: string[], message: string): string[] {
  const uniqueValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))];

  if (uniqueValues.length === 0) {
    throw new Error(message);
  }

  return uniqueValues;
}

function mapLineItem(value: unknown, index: number): ParsedLineItem {
  const record = requireRecord(value, `Canvas line item ${index} must be an object.`);

  return {
    lineItemUrl: requireTrimmedString(
      valueAsString(record.id),
      `Canvas line item ${index} must include id.`,
    ),
    resourceLinkId: requireTrimmedString(
      valueAsString(record.resourceLinkId),
      `Canvas line item ${index} must include resourceLinkId.`,
    ),
    resourceId: requireTrimmedString(
      valueAsString(record.resourceId),
      `Canvas line item ${index} must include resourceId.`,
    ),
    tag: requireTrimmedString(
      valueAsString(record.tag),
      `Canvas line item ${index} must include tag.`,
    ),
    label: requireTrimmedString(
      valueAsString(record.label),
      `Canvas line item ${index} must include label.`,
    ),
    scoreMaximum: requireNumber(
      record.scoreMaximum,
      `Canvas line item ${index} must include scoreMaximum.`,
    ),
  };
}

export function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function requireNumber(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(message);
  }

  return value;
}

function valueAsString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

import type { JSONWebKeySet } from 'jose';

export async function loadJwks(url: string): Promise<JSONWebKeySet> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Canvas JWKS fetch failed for ${url}.`);
  }

  return await response.json();
}

export function createOpaqueToken(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(18)));
}

function encodeBase64Url(bytes: Uint8Array): string {
  const chunk = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');

  return btoa(chunk).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

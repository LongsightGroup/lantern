export function labCookieName(labId: string): string {
  return `lantern_python_lab_${labId}`;
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function appendCookie(
  headers: Headers,
  name: string,
  value: string,
  path: string,
  maxAge: number,
): void {
  headers.append(
    'set-cookie',
    `${name}=${encodeURIComponent(
      value,
    )}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
  );
}

export async function hashToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function randomToken(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

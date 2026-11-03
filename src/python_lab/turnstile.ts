export interface PythonLabHumanVerifier {
  verify(input: { readonly token: string; readonly remoteIp: string | null }): Promise<void>;
}

export function createTurnstilePythonLabHumanVerifier(secret: string): PythonLabHumanVerifier {
  return {
    async verify(input) {
      if (input.token.trim() === '') {
        throw new Error('Complete the verification check before creating a Python Lab.');
      }

      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret,
          response: input.token,
          ...(input.remoteIp === null ? {} : { remoteip: input.remoteIp }),
        }),
      });

      if (!response.ok) {
        throw new Error('Verification service was unavailable.');
      }

      const body = await response.json();

      if (
        body === null ||
        typeof body !== 'object' ||
        (body as Record<string, unknown>).success !== true
      ) {
        throw new Error('Verification was not accepted.');
      }
    },
  };
}

export function createUnavailablePythonLabHumanVerifier(message: string): PythonLabHumanVerifier {
  return {
    verify() {
      return Promise.reject(new Error(message));
    },
  };
}

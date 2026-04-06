import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from 'jose';

export async function verifyIdTokenWithJwksRetry(input: {
  idToken: string;
  issuer: string;
  audience: string;
  jwksUrl: string;
  now: () => Date;
  loadJwks: (url: string) => Promise<JSONWebKeySet>;
  allowRetry?: boolean;
  onRetry?: () => void | Promise<void>;
}): Promise<Awaited<ReturnType<typeof jwtVerify>>['payload']> {
  const initialJwks = await input.loadJwks(input.jwksUrl);

  try {
    return await verifyIdToken(input, initialJwks);
  } catch (error) {
    if (input.allowRetry === false) {
      throw error;
    }

    await input.onRetry?.();
    const refreshedJwks = await input.loadJwks(input.jwksUrl);

    return await verifyIdToken(input, refreshedJwks);
  }
}

async function verifyIdToken(
  input: {
    idToken: string;
    issuer: string;
    audience: string;
    now: () => Date;
  },
  jwks: JSONWebKeySet,
): Promise<Awaited<ReturnType<typeof jwtVerify>>['payload']> {
  const verified = await jwtVerify(input.idToken, createLocalJWKSet(jwks), {
    issuer: input.issuer,
    audience: input.audience,
    currentDate: input.now(),
  });

  return verified.payload;
}

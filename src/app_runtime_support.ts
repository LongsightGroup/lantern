import type { PackageReviewRepository } from './package_review/repository.ts';

export async function requireRuntimeSession(
  repository: PackageReviewRepository,
  sessionId: string,
) {
  const session = await repository.getRuntimeSessionById(sessionId);

  if (!session) {
    throw new Error(`Runtime session ${sessionId} was not found.`);
  }

  return session;
}

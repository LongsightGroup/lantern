import type { Pool } from '@db/postgres';
import { withClient, withTransaction } from './repository_core.ts';
import {
  mapAttemptEvidenceArtifactRow,
  mapOptionalAttemptEvidenceArtifact,
} from './repository_mappers_attempts.ts';
import type { AttemptEvidenceArtifactRow } from './repository_row_types.ts';
import { isUniqueViolation } from './repository_value_support.ts';
import type { PackageReviewRepository } from './repository.ts';

const ATTEMPT_EVIDENCE_ARTIFACT_SELECT = `
  SELECT
    artifact_id,
    attempt_id,
    sequence,
    kind,
    content_type,
    file_name,
    storage_key,
    byte_size,
    sha256,
    created_at
  FROM attempt_evidence_artifacts
`;

export function createAttemptEvidenceRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | 'createAttemptEvidenceArtifact'
  | 'getAttemptEvidenceArtifactById'
  | 'listAttemptEvidenceArtifacts'
> {
  return {
    async createAttemptEvidenceArtifact(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          'create_attempt_evidence_artifact',
          async (transaction) => {
            const attemptResult = await transaction.queryObject<{
              attemptId: string;
            }>({
              text: `
                SELECT attempt_id
                FROM attempts
                WHERE attempt_id = $1
                FOR UPDATE
              `,
              args: [input.attemptId],
              camelCase: true,
            });

            if (!attemptResult.rows[0]) {
              throw new Error(`Attempt ${input.attemptId} was not found.`);
            }

            const sequenceResult = await transaction.queryObject<{
              nextSequence: number;
            }>({
              text: `
                SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
                FROM attempt_evidence_artifacts
                WHERE attempt_id = $1
              `,
              args: [input.attemptId],
              camelCase: true,
            });
            const nextSequence = sequenceResult.rows[0]?.nextSequence ?? 1;

            try {
              const result = await transaction.queryObject<AttemptEvidenceArtifactRow>({
                text: `
                  INSERT INTO attempt_evidence_artifacts (
                    artifact_id,
                    attempt_id,
                    sequence,
                    kind,
                    content_type,
                    file_name,
                    storage_key,
                    byte_size,
                    sha256,
                    created_at
                  ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
                  )
                  RETURNING
                    artifact_id,
                    attempt_id,
                    sequence,
                    kind,
                    content_type,
                    file_name,
                    storage_key,
                    byte_size,
                    sha256,
                    created_at
                `,
                args: [
                  input.artifactId,
                  input.attemptId,
                  nextSequence,
                  input.kind,
                  input.contentType,
                  input.fileName,
                  input.storageKey,
                  input.byteSize,
                  input.sha256,
                  input.createdAt,
                ],
                camelCase: true,
              });

              return mapAttemptEvidenceArtifactRow(result.rows[0]);
            } catch (error) {
              if (isUniqueViolation(error)) {
                throw new Error(
                  `Attempt evidence artifact ${input.artifactId} already exists and cannot be replaced.`,
                );
              }

              throw error;
            }
          },
        );
      });
    },

    async getAttemptEvidenceArtifactById(artifactId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<AttemptEvidenceArtifactRow>({
          text: `${ATTEMPT_EVIDENCE_ARTIFACT_SELECT} WHERE artifact_id = $1`,
          args: [artifactId],
          camelCase: true,
        });

        return mapOptionalAttemptEvidenceArtifact(result.rows[0]);
      });
    },

    async listAttemptEvidenceArtifacts(attemptId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<AttemptEvidenceArtifactRow>({
          text: `
            ${ATTEMPT_EVIDENCE_ARTIFACT_SELECT}
            WHERE attempt_id = $1
            ORDER BY sequence ASC
          `,
          args: [attemptId],
          camelCase: true,
        });

        return result.rows.map(mapAttemptEvidenceArtifactRow);
      });
    },
  };
}

import type { Pool } from '@db/postgres';
import { withClient, withTransaction } from './repository_core.ts';
import {
  mapDynamicRegistrationStateRow,
  mapOptionalDynamicRegistrationState,
} from './repository_mappers_package.ts';
import type { DynamicRegistrationStateRow } from './repository_row_types.ts';
import { isUniqueViolation } from './repository_value_support.ts';
import type { PackageReviewRepository } from './repository.ts';

export function createDynamicRegistrationStateRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | 'createDynamicRegistrationState'
  | 'getDynamicRegistrationStateByState'
  | 'consumeDynamicRegistrationState'
> {
  return {
    async createDynamicRegistrationState(record) {
      return await withClient(pool, async (client) => {
        try {
          const result = await client.queryObject<DynamicRegistrationStateRow>({
            text: `
              INSERT INTO dynamic_registration_states (
                state,
                app_id,
                lms_type,
                created_at,
                expires_at,
                used_at
              ) VALUES ($1, $2, $3, $4, $5, $6)
              RETURNING
                state,
                app_id,
                lms_type,
                created_at,
                expires_at,
                used_at
            `,
            args: [
              record.state,
              record.appId,
              record.lms,
              record.createdAt,
              record.expiresAt,
              record.usedAt,
            ],
            camelCase: true,
          });

          return mapDynamicRegistrationStateRow(result.rows[0]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new Error(
              `Dynamic registration state ${record.state} already exists and cannot be reused.`,
            );
          }

          throw error;
        }
      });
    },

    async getDynamicRegistrationStateByState(state) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<DynamicRegistrationStateRow>({
          text: `
            SELECT
              state,
              app_id,
              lms_type,
              created_at,
              expires_at,
              used_at
            FROM dynamic_registration_states
            WHERE state = $1
          `,
          args: [state],
          camelCase: true,
        });

        return mapOptionalDynamicRegistrationState(result.rows[0]);
      });
    },

    async consumeDynamicRegistrationState(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          'consume_dynamic_registration_state',
          async (transaction) => {
            const updated = await transaction.queryObject<DynamicRegistrationStateRow>({
              text: `
                  UPDATE dynamic_registration_states
                  SET used_at = $2
                  WHERE state = $1
                    AND used_at IS NULL
                  RETURNING
                    state,
                    app_id,
                    lms_type,
                    created_at,
                    expires_at,
                    used_at
                `,
              args: [input.state, input.usedAt],
              camelCase: true,
            });

            const consumed = updated.rows[0];

            if (consumed) {
              return mapDynamicRegistrationStateRow(consumed);
            }

            const existing = await transaction.queryObject<DynamicRegistrationStateRow>({
              text: `
                  SELECT
                    state,
                    app_id,
                    lms_type,
                    created_at,
                    expires_at,
                    used_at
                  FROM dynamic_registration_states
                  WHERE state = $1
                `,
              args: [input.state],
              camelCase: true,
            });
            const row = existing.rows[0];

            if (!row) {
              throw new Error(`Dynamic registration state ${input.state} was not found.`);
            }

            if (row.usedAt !== null) {
              throw new Error(`Dynamic registration state ${input.state} has already been used.`);
            }

            throw new Error(`Dynamic registration state ${input.state} could not be consumed.`);
          },
        );
      });
    },
  };
}

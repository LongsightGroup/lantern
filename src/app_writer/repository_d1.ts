import type { D1Database } from '../db/d1.ts';
import { queryD1First, runD1 } from '../db/d1.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import { type AppGenerationRunRecord, type AppGenerationWorkspaceRecord } from './types.ts';
import {
  D1_APP_GENERATION_RUN_SELECT,
  D1_APP_GENERATION_WORKSPACE_SELECT,
  type D1AppGenerationRunRow,
  type D1AppGenerationWorkspaceRow,
  mapD1AppGenerationRunFields,
  mapD1AppGenerationWorkspaceFields,
  serializeAppGenerationRun,
  serializeAppGenerationWorkspace,
} from './repository_d1_mapping.ts';

export function createD1AppGenerationRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  | 'createAppGenerationRun'
  | 'getAppGenerationRunById'
  | 'updateAppGenerationRun'
  | 'saveAppGenerationWorkspace'
  | 'getAppGenerationWorkspaceByGenerationId'
> {
  return {
    async createAppGenerationRun(record) {
      try {
        await runD1(
          db,
          `
            INSERT INTO app_generation_runs (
              generation_id,
              owner_id,
              status,
              requested_app_id,
              generated_app_id,
              generated_version,
              package_version_id,
              prompt_text,
              normalized_request_json,
              app_plan_json,
              selected_starter_id,
              selected_context_json,
              model_request_metadata_json,
              generation_notes_json,
              validation_findings_json,
              repair_attempt_count,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          serializeAppGenerationRun(record),
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(
            `App generation run ${record.generationId} already exists and cannot be replaced.`,
          );
        }

        throw error;
      }

      return await requireAppGenerationRun(db, record.generationId);
    },

    async getAppGenerationRunById(generationId) {
      const row = await queryAppGenerationRunRow(db, generationId);

      return row === null ? null : mapD1AppGenerationRunFields(row);
    },

    async updateAppGenerationRun(record) {
      await runD1(
        db,
        `
          UPDATE app_generation_runs
          SET
            owner_id = ?,
            status = ?,
            requested_app_id = ?,
            generated_app_id = ?,
            generated_version = ?,
            package_version_id = ?,
            prompt_text = ?,
            normalized_request_json = ?,
            app_plan_json = ?,
            selected_starter_id = ?,
            selected_context_json = ?,
            model_request_metadata_json = ?,
            generation_notes_json = ?,
            validation_findings_json = ?,
            repair_attempt_count = ?,
            created_at = ?,
            updated_at = ?
          WHERE generation_id = ?
        `,
        [...serializeAppGenerationRun(record).slice(1), record.generationId],
      );

      return await requireAppGenerationRun(db, record.generationId);
    },

    async saveAppGenerationWorkspace(record) {
      await runD1(
        db,
        `
          INSERT INTO app_generation_workspaces (
            generation_id,
            selected_starter_id,
            files_json,
            generation_plan_json,
            validation_findings_json,
            repair_attempt_count,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(generation_id) DO UPDATE SET
            selected_starter_id = excluded.selected_starter_id,
            files_json = excluded.files_json,
            generation_plan_json = excluded.generation_plan_json,
            validation_findings_json = excluded.validation_findings_json,
            repair_attempt_count = excluded.repair_attempt_count,
            updated_at = excluded.updated_at
        `,
        serializeAppGenerationWorkspace(record),
      );

      return await requireAppGenerationWorkspace(db, record.generationId);
    },

    async getAppGenerationWorkspaceByGenerationId(generationId) {
      const row = await queryAppGenerationWorkspaceRow(db, generationId);

      return row === null ? null : mapD1AppGenerationWorkspaceFields(row);
    },
  };
}

async function queryAppGenerationRunRow(
  db: D1Database,
  generationId: string,
): Promise<D1AppGenerationRunRow | null> {
  return await queryD1First<D1AppGenerationRunRow>(
    db,
    `${D1_APP_GENERATION_RUN_SELECT} WHERE generation_id = ?`,
    [generationId],
  );
}

async function requireAppGenerationRun(
  db: D1Database,
  generationId: string,
): Promise<AppGenerationRunRecord> {
  const row = await queryAppGenerationRunRow(db, generationId);

  if (row === null) {
    throw new Error(`App generation run ${generationId} was not found.`);
  }

  return mapD1AppGenerationRunFields(row);
}

async function queryAppGenerationWorkspaceRow(
  db: D1Database,
  generationId: string,
): Promise<D1AppGenerationWorkspaceRow | null> {
  return await queryD1First<D1AppGenerationWorkspaceRow>(
    db,
    `${D1_APP_GENERATION_WORKSPACE_SELECT} WHERE generation_id = ?`,
    [generationId],
  );
}

async function requireAppGenerationWorkspace(
  db: D1Database,
  generationId: string,
): Promise<AppGenerationWorkspaceRecord> {
  const row = await queryAppGenerationWorkspaceRow(db, generationId);

  if (row === null) {
    throw new Error(`App generation workspace ${generationId} was not found.`);
  }

  return mapD1AppGenerationWorkspaceFields(row);
}

function isD1UniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

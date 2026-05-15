import {
  APP_GENERATION_PROGRESS_STAGES,
  APP_WRITER_WORKSPACE_FILE_ROLES,
  type AppGenerationProgressUpdate,
  type AppGenerationValidationFinding,
  type AppWriterWorkspaceFile,
  type AppWriterWorkspaceFileRole,
} from './types.ts';

export function parseWorkspaceFiles(value: unknown, fieldName: string): AppWriterWorkspaceFile[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    const record = expectRecord(item, `${fieldName}[${index}]`);
    const file: AppWriterWorkspaceFile = {
      path: expectString(record.path, `${fieldName}[${index}].path`),
      contents: expectString(record.contents, `${fieldName}[${index}].contents`),
    };

    if (record.role !== undefined) {
      file.role = expectWorkspaceFileRole(record.role, `${fieldName}[${index}].role`);
    }

    return file;
  });
}

export function parseProgressUpdates(
  value: unknown,
  fieldName: string,
): AppGenerationProgressUpdate[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    const record = expectRecord(item, `${fieldName}[${index}]`);

    return {
      stage: expectProgressStage(record.stage, `${fieldName}[${index}].stage`),
      message: expectString(record.message, `${fieldName}[${index}].message`),
    };
  });
}

export function parseValidationFindings(
  value: unknown,
  fieldName: string,
): AppGenerationValidationFinding[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    const record = expectRecord(item, `${fieldName}[${index}]`);

    return {
      code: expectString(record.code, `${fieldName}[${index}].code`),
      severity: expectValidationSeverity(record.severity, `${fieldName}[${index}].severity`),
      message: expectString(record.message, `${fieldName}[${index}].message`),
      file: expectNullableString(record.file, `${fieldName}[${index}].file`),
      field: expectNullableString(record.field, `${fieldName}[${index}].field`),
      fix: expectNullableString(record.fix, `${fieldName}[${index}].fix`),
      detail: expectRecord(record.detail, `${fieldName}[${index}].detail`),
    };
  });
}

export function expectRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
}

export function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be text.`);
  }

  return value;
}

export function expectNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  return expectString(value, fieldName);
}

export function expectStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be a string array.`);
  }

  return value.map((item, index) => expectString(item, `${fieldName}[${index}]`));
}

function expectValidationSeverity(
  value: unknown,
  fieldName: string,
): AppGenerationValidationFinding['severity'] {
  if (value !== 'error' && value !== 'warning') {
    throw new TypeError(`${fieldName} must be error or warning.`);
  }

  return value;
}

function expectWorkspaceFileRole(value: unknown, fieldName: string): AppWriterWorkspaceFileRole {
  for (const role of APP_WRITER_WORKSPACE_FILE_ROLES) {
    if (value === role) {
      return role;
    }
  }

  throw new TypeError(`${fieldName} must be a supported workspace file role.`);
}

function expectProgressStage(
  value: unknown,
  fieldName: string,
): AppGenerationProgressUpdate['stage'] {
  for (const stage of APP_GENERATION_PROGRESS_STAGES) {
    if (value === stage) {
      return stage;
    }
  }

  throw new TypeError(`${fieldName} must be a supported generation progress stage.`);
}

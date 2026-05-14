export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: D1Parameter[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run(): Promise<D1Result<Record<string, unknown>>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

export interface D1Result<T> {
  success: boolean;
  results?: T[];
  error?: string;
  meta?: Record<string, unknown>;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export type D1Parameter = string | number | null | ArrayBuffer;

type SqlQuote = "'" | '"' | '`';

export function isD1Database(value: unknown): value is D1Database {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<D1Database>).prepare === 'function' &&
    typeof (value as Partial<D1Database>).batch === 'function' &&
    typeof (value as Partial<D1Database>).exec === 'function'
  );
}

export function prepareD1(
  db: D1Database,
  sql: string,
  parameters: readonly unknown[] = [],
): D1PreparedStatement {
  const statement = db.prepare(sql);
  const normalizedParameters = parameters.map(normalizeD1Parameter);

  if (normalizedParameters.length === 0) {
    return statement;
  }

  return statement.bind(...normalizedParameters);
}

export async function queryD1Objects<T extends Record<string, unknown>>(
  db: D1Database,
  sql: string,
  parameters: readonly unknown[] = [],
): Promise<T[]> {
  const result = await prepareD1(db, sql, parameters).all<T>();
  assertD1Success(result);

  return result.results ?? [];
}

export async function queryD1First<T extends Record<string, unknown>>(
  db: D1Database,
  sql: string,
  parameters: readonly unknown[] = [],
): Promise<T | null> {
  return await prepareD1(db, sql, parameters).first<T>();
}

export async function runD1(
  db: D1Database,
  sql: string,
  parameters: readonly unknown[] = [],
): Promise<void> {
  assertD1Success(await prepareD1(db, sql, parameters).run());
}

export async function runD1Statements(db: D1Database, sql: string): Promise<void> {
  const statements = splitSqlStatements(sql);

  if (statements.length === 0) {
    return;
  }

  const results = await db.batch(statements.map((statement) => db.prepare(statement)));

  for (const result of results) {
    assertD1Success(result);
  }
}

export function normalizeD1Parameter(value: unknown): D1Parameter {
  if (value === null || typeof value === 'string' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (value instanceof Uint8Array) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return copy.buffer;
  }

  if (Array.isArray(value) || isJsonObject(value)) {
    return JSON.stringify(value);
  }

  throw new TypeError(`Unsupported D1 bind value: ${typeof value}.`);
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote: SqlQuote | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql.charAt(index);
    const next = sql.charAt(index + 1);

    if (lineComment) {
      current += char;

      if (char === '\n') {
        lineComment = false;
      }

      continue;
    }

    if (blockComment) {
      current += char;

      if (char === '*' && next === '/') {
        current += next;
        index += 1;
        blockComment = false;
      }

      continue;
    }

    if (quote !== null) {
      current += char;

      if (char === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }

      continue;
    }

    if (char === '-' && next === '-') {
      current += char + next;
      index += 1;
      lineComment = true;
      continue;
    }

    if (char === '/' && next === '*') {
      current += char + next;
      index += 1;
      blockComment = true;
      continue;
    }

    if (isSqlQuote(char)) {
      current += char;
      quote = char;
      continue;
    }

    if (char === ';') {
      pushStatement();
      continue;
    }

    current += char;
  }

  pushStatement();

  return statements;

  function pushStatement() {
    const statement = current.trim();

    if (statement.length > 0) {
      statements.push(statement);
    }

    current = '';
  }
}

function assertD1Success(result: D1Result<unknown>): void {
  if (!result.success) {
    throw new Error(result.error ?? 'D1 query failed.');
  }
}

function isSqlQuote(value: string): value is SqlQuote {
  return value === "'" || value === '"' || value === '`';
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

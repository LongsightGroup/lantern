import postgres, {
  type Options as PostgresOptions,
  type ParameterOrJSON,
  PostgresError as PostgresJsError,
} from 'postgres';

export interface ClientOptions {
  hostname?: string;
  user?: string;
  password?: string;
  database?: string;
  port?: number;
  applicationName?: string;
  options?: string;
  tls?: {
    enabled: boolean;
    enforce?: boolean;
    caCertificates?: string[];
  };
}

export type PostgresError = PostgresJsError & {
  fields?: {
    code?: string;
  };
};

export interface QueryObjectOptions {
  text: string;
  args?: readonly unknown[];
  camelCase?: boolean;
}

export type QueryArrayInput =
  | string
  | {
      text: string;
      args?: readonly unknown[];
    };

export interface QueryObjectResult<Row> {
  rows: Row[];
}

export interface QueryArrayResult {
  rows: unknown[][];
}

export interface TransactionClient {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  queryObject<Row>(query: QueryObjectOptions): Promise<QueryObjectResult<Row>>;
  queryArray(query: QueryArrayInput, args?: readonly unknown[]): Promise<QueryArrayResult>;
}

type TransactionOptions = {
  isolation_level?: 'serializable' | 'repeatable_read' | 'read_committed' | 'read_uncommitted';
};

export interface PoolClient {
  queryObject<Row>(query: QueryObjectOptions): Promise<QueryObjectResult<Row>>;
  queryArray(query: QueryArrayInput, args?: readonly unknown[]): Promise<QueryArrayResult>;
  createTransaction(name: string, options?: TransactionOptions): TransactionClient;
  release(): void;
}

type SqlOptions = PostgresOptions<Record<string, never>>;
type SqlParameter = ParameterOrJSON<never>;
type SqlConnection = ReturnType<typeof postgres>;
type ReservedConnection = Awaited<ReturnType<SqlConnection['reserve']>>;
type SqlSsl = NonNullable<SqlOptions['ssl']>;
type ConnectionLease = {
  reserved: ReservedConnection;
  sql: SqlConnection;
};
type PoolWaiter = {
  reject: (error: Error) => void;
  resolve: (client: PoolClient) => void;
};

export interface PoolOptions {
  hyperdrive?: boolean;
}

export class Pool {
  readonly #config: string | ClientOptions;
  readonly #size: number;
  readonly #hyperdrive: boolean;
  readonly #idleConnections: ConnectionLease[] = [];
  readonly #allConnections = new Set<ConnectionLease>();
  readonly #waiters: PoolWaiter[] = [];
  #ending = false;

  constructor(config: string | ClientOptions, size = 3, _lazy = true, options: PoolOptions = {}) {
    this.#config = config;
    this.#size = size;
    this.#hyperdrive = options.hyperdrive === true;
  }

  async connect(): Promise<PoolClient> {
    if (this.#ending) {
      throw new Error('Postgres pool is closed.');
    }

    const idleConnection = this.#idleConnections.shift();

    if (idleConnection !== undefined) {
      return createPoolClient(this, idleConnection);
    }

    if (this.#allConnections.size < this.#size) {
      const sql = createSqlConnection(this.#config, this.#hyperdrive);
      const lease = {
        sql,
        reserved: await sql.reserve(),
      };

      this.#allConnections.add(lease);

      return createPoolClient(this, lease);
    }

    return await new Promise((resolve, reject) => {
      this.#waiters.push({ resolve, reject });
    });
  }

  async end(): Promise<void> {
    this.#ending = true;

    while (this.#waiters.length > 0) {
      this.#waiters.shift()?.reject(new Error('Postgres pool is closed.'));
    }

    await Promise.all(
      [...this.#allConnections].map(async (lease) => {
        try {
          lease.reserved.release();
          await lease.sql.end({ timeout: 0 });
        } finally {
          this.#allConnections.delete(lease);
        }
      }),
    );

    this.#idleConnections.length = 0;
  }

  releaseConnection(connection: ConnectionLease): void {
    if (!this.#allConnections.has(connection)) {
      return;
    }

    if (this.#ending) {
      connection.reserved.release();
      void connection.sql.end({ timeout: 0 }).finally(() => {
        this.#allConnections.delete(connection);
      });
      return;
    }

    const waiter = this.#waiters.shift();

    if (waiter !== undefined) {
      waiter.resolve(createPoolClient(this, connection));
      return;
    }

    this.#idleConnections.push(connection);
  }
}

function createPoolClient(pool: Pool, connection: ConnectionLease): PoolClient {
  let released = false;

  return {
    async queryObject<Row>(query: QueryObjectOptions) {
      const result = await connection.reserved.unsafe(
        query.text,
        normalizeArgs(query.text, query.args),
      );

      return {
        rows: normalizeObjectRows<Row>(
          result as Record<string, unknown>[],
          query.camelCase === true,
        ),
      };
    },
    async queryArray(query: QueryArrayInput, args?: readonly unknown[]) {
      const result = await resolveQuery(connection.reserved, query, args).values();

      return {
        rows: [...result] as unknown[][],
      };
    },
    createTransaction(_name: string, options: TransactionOptions = {}) {
      return createTransactionClient(connection.reserved, options);
    },
    release() {
      if (released) {
        return;
      }

      released = true;
      pool.releaseConnection(connection);
    },
  };
}

function createTransactionClient(
  client: ReservedConnection,
  options: TransactionOptions,
): TransactionClient {
  return {
    async begin() {
      const isolationLevel = options.isolation_level;

      await client.unsafe(
        isolationLevel === undefined
          ? 'BEGIN'
          : `BEGIN ISOLATION LEVEL ${normalizeIsolationLevel(isolationLevel)}`,
      );
    },
    async commit() {
      await client.unsafe('COMMIT');
    },
    async rollback() {
      await client.unsafe('ROLLBACK');
    },
    async queryObject<Row>(query: QueryObjectOptions) {
      const result = await client.unsafe(query.text, normalizeArgs(query.text, query.args));

      return {
        rows: normalizeObjectRows<Row>(
          result as Record<string, unknown>[],
          query.camelCase === true,
        ),
      };
    },
    async queryArray(query: QueryArrayInput, args?: readonly unknown[]) {
      const result = await resolveQuery(client, query, args).values();

      return {
        rows: [...result] as unknown[][],
      };
    },
  };
}

function createSqlConnection(config: string | ClientOptions, hyperdrive = false): SqlConnection {
  return typeof config === 'string'
    ? postgres(config, buildSqlOptions(hyperdrive))
    : postgres(buildConfiguredSqlOptions(config, hyperdrive));
}

function buildSqlOptions(hyperdrive: boolean): SqlOptions {
  return {
    // Keep one reserved connection per outer Pool slot. On Workers, Hyperdrive
    // already owns the database-side pooling, so multiplying local pools just
    // burns connection budget.
    max: 1,
    fetch_types: true,
    prepare: hyperdrive,
    onnotice: () => {},
  };
}

function buildConfiguredSqlOptions(config: ClientOptions, hyperdrive: boolean): SqlOptions {
  const options: SqlOptions = buildSqlOptions(hyperdrive);

  if (config.hostname !== undefined) {
    options.host = config.hostname;
  }

  if (config.user !== undefined) {
    options.user = config.user;
  }

  if (config.password !== undefined) {
    options.pass = config.password;
  }

  if (config.database !== undefined) {
    options.database = config.database;
  }

  if (config.port !== undefined) {
    options.port = config.port;
  }

  if (config.applicationName !== undefined || config.options !== undefined) {
    options.connection = {};
  }

  if (config.applicationName !== undefined) {
    options.connection = {
      ...options.connection,
      application_name: config.applicationName,
    };
  }

  if (config.options !== undefined) {
    options.connection = {
      ...options.connection,
      options: config.options,
    };
  }

  if (config.tls !== undefined) {
    options.ssl = buildSslConfig(config.tls);
  }

  return options;
}

function buildSslConfig(tls: NonNullable<ClientOptions['tls']>): SqlSsl {
  if (tls.enabled === false) {
    return false;
  }

  const ssl: Record<string, unknown> = {
    rejectUnauthorized: tls.enforce === true,
  };

  if (tls.caCertificates !== undefined && tls.caCertificates.length > 0) {
    ssl.ca = tls.caCertificates.join('\n');
  }

  return ssl;
}

function resolveQuery(
  client: ReservedConnection,
  query: QueryArrayInput,
  args?: readonly unknown[],
) {
  if (typeof query === 'string') {
    return client.unsafe(query, normalizeArgs(query, args));
  }

  return client.unsafe(query.text, normalizeArgs(query.text, query.args));
}

function normalizeArgs(queryText: string, args: readonly unknown[] | undefined): SqlParameter[] {
  if (args === undefined) {
    return [];
  }

  const jsonParameters = collectJsonParameterIndexes(queryText);

  return args.map((value, index) =>
    normalizeArg(value, jsonParameters.has(index + 1) ? 'json' : 'default'),
  ) as SqlParameter[];
}

function normalizeArg(value: unknown, mode: 'default' | 'json'): SqlParameter {
  if (mode === 'json') {
    return normalizeJsonArg(value);
  }

  return value as SqlParameter;
}

function normalizeJsonArg(value: unknown): SqlParameter {
  if (typeof value !== 'string') {
    return value as SqlParameter;
  }

  try {
    return JSON.parse(value) as SqlParameter;
  } catch {
    return value as SqlParameter;
  }
}

function collectJsonParameterIndexes(queryText: string): Set<number> {
  const indexes = new Set<number>();

  for (const match of queryText.matchAll(/\$(\d+)\s*::\s*jsonb?\b/gi)) {
    indexes.add(Number(match[1]));
  }

  return indexes;
}

function normalizeObjectRows<Row>(
  rows: readonly Record<string, unknown>[],
  camelCase: boolean,
): Row[] {
  return rows.map((row) => normalizeRow(row, camelCase)) as Row[];
}

function normalizeRow(row: Record<string, unknown>, camelCase: boolean): Record<string, unknown> {
  if (!camelCase) {
    return row;
  }

  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[toCamelCase(key)] = value;
  }

  return normalized;
}

function toCamelCase(value: string): string {
  return value.replaceAll(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function normalizeIsolationLevel(value: TransactionOptions['isolation_level']): string {
  return value?.replaceAll('_', ' ').toUpperCase() ?? 'READ COMMITTED';
}

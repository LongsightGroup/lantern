import { type ClientOptions, Pool } from '@db/postgres';
import type { EnvReader } from '../platform/env.ts';

const DEFAULT_POOL_SIZE = 3;
const DATABASE_CA_CERT_ENV = 'DATABASE_CA_CERT';
const DATABASE_URL_ENV = 'DATABASE_URL';

export function requireDatabaseUrl(env: EnvReader): string {
  const databaseUrl = env.get(DATABASE_URL_ENV)?.trim();

  if (!databaseUrl) {
    throw new Error(`${DATABASE_URL_ENV} is required for Lantern package review persistence.`);
  }

  return databaseUrl;
}

export function resolveDatabasePoolConfig(env: EnvReader): string | ClientOptions {
  const databaseUrl = requireDatabaseUrl(env);
  const databaseCaCert = readOptionalEnv(env, DATABASE_CA_CERT_ENV);

  if (databaseCaCert === null) {
    return databaseUrl;
  }

  return buildDatabaseClientOptions(databaseUrl, databaseCaCert);
}

export function createDatabasePool(env: EnvReader, size = DEFAULT_POOL_SIZE): Pool {
  return new Pool(resolveDatabasePoolConfig(env), size, true);
}

export interface HyperdriveBinding {
  connectionString: string;
}

export function createHyperdriveDatabasePool(binding: HyperdriveBinding): Pool {
  // Hyperdrive owns the database connection pool. The Worker adapter creates
  // a fresh SQL connection for each repository connect instead of maintaining a
  // second pool inside the isolate.
  return new Pool(requireHyperdriveConnectionString(binding), 1, true, {
    hyperdrive: true,
  });
}

export function requireHyperdriveConnectionString(binding: HyperdriveBinding): string {
  const connectionString = binding.connectionString.trim();

  if (connectionString === '') {
    throw new Error(
      'Cloudflare Hyperdrive binding HYPERDRIVE.connectionString is required for Worker persistence.',
    );
  }

  return connectionString;
}

export function buildDatabaseClientOptions(
  databaseUrl: string,
  databaseCaCert: string,
): ClientOptions {
  const url = new URL(databaseUrl);
  const config: ClientOptions = {
    hostname: url.hostname,
    tls: resolveDatabaseTlsOptions(url.searchParams.get('sslmode'), databaseCaCert),
  };
  const user = decodeConnectionComponent(url.username);
  const password = decodeConnectionComponent(url.password);
  const database = readDatabaseName(url);
  const port = parsePort(url.port);
  const applicationName = readOptionalSearchParam(url, 'application_name');
  const options = readOptionalSearchParam(url, 'options');

  if (user !== null) {
    config.user = user;
  }

  if (password !== null) {
    config.password = password;
  }

  if (database !== null) {
    config.database = database;
  }

  if (port !== null) {
    config.port = port;
  }

  if (applicationName !== null) {
    config.applicationName = applicationName;
  }

  if (options !== null) {
    config.options = options;
  }

  return config;
}

function resolveDatabaseTlsOptions(
  sslMode: string | null,
  databaseCaCert: string,
): NonNullable<ClientOptions['tls']> {
  const normalizedSslMode = sslMode?.toLowerCase() ?? null;

  if (normalizedSslMode === 'disable') {
    return {
      enabled: false,
    };
  }

  if (
    normalizedSslMode === 'require' ||
    normalizedSslMode === 'verify-ca' ||
    normalizedSslMode === 'verify-full'
  ) {
    return {
      enabled: true,
      enforce: true,
      caCertificates: [databaseCaCert],
    };
  }

  return {
    enabled: true,
    caCertificates: [databaseCaCert],
  };
}

function readDatabaseName(url: URL): string | null {
  const databaseName =
    readOptionalSearchParam(url, 'dbname') ?? decodeConnectionComponent(url.pathname.slice(1));

  return databaseName === null || databaseName === '' ? null : databaseName;
}

function readOptionalSearchParam(url: URL, key: string): string | null {
  const value = url.searchParams.get(key);

  return value === null || value === '' ? null : value;
}

function parsePort(port: string): number | null {
  if (port === '') {
    return null;
  }

  const numericPort = Number(port);

  return Number.isInteger(numericPort) ? numericPort : null;
}

function decodeConnectionComponent(value: string): string | null {
  if (value === '') {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readOptionalEnv(env: EnvReader, key: string): string | null {
  const value = env.get(key)?.trim();

  return value === undefined || value === '' ? null : value;
}

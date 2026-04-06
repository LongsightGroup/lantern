import { assertEquals, assertObjectMatch } from '@std/assert';
import { buildDatabaseClientOptions, resolveDatabasePoolConfig } from './pool.ts';

Deno.test('resolveDatabasePoolConfig returns the raw connection string when no CA cert is configured', () => {
  const databaseUrl =
    'postgres://doadmin:secret@example-do-user-123.db.ondigitalocean.com:25060/defaultdb?sslmode=require';

  assertEquals(
    resolveDatabasePoolConfig({
      get(name: string) {
        return name === 'DATABASE_URL' ? databaseUrl : undefined;
      },
    }),
    databaseUrl,
  );
});

Deno.test('buildDatabaseClientOptions attaches the configured CA certificate for TLS verification', () => {
  const config = buildDatabaseClientOptions(
    'postgres://doadmin:secret@example-do-user-123.db.ondigitalocean.com:25060/defaultdb?sslmode=require&application_name=lantern',
    '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----',
  );

  assertObjectMatch(config, {
    hostname: 'example-do-user-123.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'secret',
    database: 'defaultdb',
    applicationName: 'lantern',
    tls: {
      enabled: true,
      enforce: true,
      caCertificates: ['-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----'],
    },
  });
});

Deno.test('buildDatabaseClientOptions preserves sslmode=disable when a CA cert is present', () => {
  const config = buildDatabaseClientOptions(
    'postgres://doadmin:secret@127.0.0.1:5432/defaultdb?sslmode=disable',
    '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----',
  );

  assertObjectMatch(config, {
    hostname: '127.0.0.1',
    port: 5432,
    database: 'defaultdb',
    tls: {
      enabled: false,
    },
  });
});

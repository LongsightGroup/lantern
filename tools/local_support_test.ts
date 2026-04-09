import { assert, assertEquals } from '@std/assert';
import {
  appendMissingEnvAssignments,
  createLocalToolPrivateJwkString,
  defaultLocalEnvAssignments,
  listDeclaredEnvKeys,
} from './local_support.ts';

Deno.test('appendMissingEnvAssignments creates the default local env file', async () => {
  const generatedJwk = await createLocalToolPrivateJwkString();
  const result = appendMissingEnvAssignments({
    existingText: null,
    assignments: {
      ...defaultLocalEnvAssignments(),
      LTI_TOOL_PRIVATE_JWK: generatedJwk,
    },
  });

  assertEquals(result.created, true);
  assertEquals(result.addedKeys, [
    'PORT',
    'APP_ORIGIN',
    'APP_RUNTIME_ORIGIN',
    'DATABASE_URL',
    'LTI_TOOL_PRIVATE_JWK',
  ]);
  assert(result.text.includes('APP_ORIGIN=http://localhost:8417'));
  assert(result.text.includes('DATABASE_URL=postgres://localhost:5432/lantern?sslmode=disable'));
  assert(result.text.includes('LTI_TOOL_PRIVATE_JWK="{'));
});

Deno.test('appendMissingEnvAssignments preserves existing keys and appends only missing ones', () => {
  const result = appendMissingEnvAssignments({
    existingText: [
      'APP_ORIGIN=http://localhost:9000',
      'DATABASE_URL=postgres://localhost:5432/custom?sslmode=disable',
      '',
    ].join('\n'),
    assignments: {
      ...defaultLocalEnvAssignments(),
      LTI_TOOL_PRIVATE_JWK: '{"kty":"RSA"}',
    },
  });

  assertEquals(result.created, false);
  assertEquals(result.addedKeys, ['PORT', 'APP_RUNTIME_ORIGIN', 'LTI_TOOL_PRIVATE_JWK']);
  assert(result.text.includes('APP_ORIGIN=http://localhost:9000'));
  assert(result.text.includes('DATABASE_URL=postgres://localhost:5432/custom?sslmode=disable'));
});

Deno.test('listDeclaredEnvKeys finds assignment keys in local env text', () => {
  const keys = listDeclaredEnvKeys(
    [
      '# comment',
      'APP_ORIGIN=http://localhost:8417',
      'DATABASE_URL=postgres://localhost:5432/lantern?sslmode=disable',
      '',
    ].join('\n'),
  );

  assertEquals(keys.has('APP_ORIGIN'), true);
  assertEquals(keys.has('DATABASE_URL'), true);
  assertEquals(keys.has('PORT'), false);
});

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
    'LTI_TOOL_PRIVATE_JWK',
  ]);
  assert(result.text.includes('APP_ORIGIN=http://localhost:8417'));
  assert(result.text.includes('LTI_TOOL_PRIVATE_JWK="{'));
});

Deno.test('appendMissingEnvAssignments preserves existing keys and appends only missing ones', () => {
  const result = appendMissingEnvAssignments({
    existingText: ['APP_ORIGIN=http://localhost:9000', ''].join('\n'),
    assignments: {
      ...defaultLocalEnvAssignments(),
      LTI_TOOL_PRIVATE_JWK: '{"kty":"RSA"}',
    },
  });

  assertEquals(result.created, false);
  assertEquals(result.addedKeys, ['PORT', 'APP_RUNTIME_ORIGIN', 'LTI_TOOL_PRIVATE_JWK']);
  assert(result.text.includes('APP_ORIGIN=http://localhost:9000'));
});

Deno.test('listDeclaredEnvKeys finds assignment keys in local env text', () => {
  const keys = listDeclaredEnvKeys(
    ['# comment', 'APP_ORIGIN=http://localhost:8417', ''].join('\n'),
  );

  assertEquals(keys.has('APP_ORIGIN'), true);
  assertEquals(keys.has('PORT'), false);
});

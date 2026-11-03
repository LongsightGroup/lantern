import { test } from 'vite-plus/test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';
import { upsertLaunchRegistration } from '@longsightgroup/lti-tool';
import { withKernelD1 } from '../lms_kernel/d1_test_support.ts';
import { createD1LtiStorage } from './tool_provider.ts';

test('upgraded LTI storage persists registrations and rejects replayed nonces on real D1', async () => {
  await withKernelD1(async (db) => {
    const storage = createD1LtiStorage(db);
    const registration = {
      iss: 'https://lms.example',
      clientId: 'lantern-client',
      deploymentId: 'course-deployment',
      authUrl: 'https://lms.example/authorize',
      tokenUrl: 'https://lms.example/token',
      jwksUrl: 'https://lms.example/jwks',
    };
    const first = await upsertLaunchRegistration(storage, registration);
    const second = await upsertLaunchRegistration(storage, registration);
    equal(first.createdClient, true);
    equal(second.createdClient, false);
    equal(second.createdDeployment, false);
    const restored = createD1LtiStorage(db);
    deepStrictEqual(
      await restored.getLaunchConfig(
        registration.iss,
        registration.clientId,
        registration.deploymentId,
      ),
      second.launchConfig,
    );
    ok(await restored.validateNonce('launch-nonce'));
    equal(await restored.validateNonce('launch-nonce'), false);
    equal((await restored.listClients()).length, 1);
  });
});

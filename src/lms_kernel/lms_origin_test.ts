import { assert, assertEquals } from '@std/assert';
import { parseLmsOrigin } from './lms_origin.ts';
import { parseConnectionFields } from './admin_support.ts';

Deno.test('LMS embedding origins accept only exact HTTPS origins', () => {
  assertEquals(parseLmsOrigin(' https://Courses.Example.edu:443/ '), 'https://courses.example.edu');
  assertEquals(
    parseLmsOrigin('https://courses.example.edu:8443'),
    'https://courses.example.edu:8443',
  );
  for (
    const value of [
      '',
      '*',
      'https://*.example.edu',
      'http://courses.example.edu',
      'https://courses.example.edu/course',
      'https://courses.example.edu?token=x',
      'https://courses.example.edu/#fragment',
      'https://user:password@courses.example.edu',
      'https://courses.example.edu; frame-ancestors *',
    ]
  ) {
    assertEquals(parseLmsOrigin(value), null, value);
  }
});

Deno.test('connection registration requires an explicit course-page origin independent of OIDC hosts', () => {
  const fields = {
    platformType: 'canvas' as const,
    issuer: 'https://issuer.example',
    clientId: 'client',
    deploymentId: 'deployment',
    authorizationEndpoint: 'https://sso.example/authorize',
    accessTokenUrl: 'https://sso.example/token',
    jwksUrl: 'https://sso.example/jwks',
  };
  assertEquals(parseConnectionFields(fields).ok, false);
  const accepted = parseConnectionFields({ ...fields, lmsOrigin: 'https://courses.example.edu/' });
  assert(accepted.ok);
  assertEquals(accepted.value.lmsOrigin, 'https://courses.example.edu');
  const synthetic = parseConnectionFields({ platformType: 'synthetic' });
  assert(synthetic.ok);
  assertEquals(synthetic.value.lmsOrigin, 'https://synthetic.lantern.invalid');
});

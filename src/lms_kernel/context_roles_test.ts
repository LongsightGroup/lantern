import { assertEquals } from '@std/assert';
import { parseLtiContextRole } from './context_roles.ts';
import { resolveGovernedLaunchActorType } from './launch_service.ts';

const MEMBERSHIP = 'http://purl.imsglobal.org/vocab/lis/v2/membership';

Deno.test('governed launches require exact standard instructor or administrator context roles', () => {
  assertEquals(resolveGovernedLaunchActorType([`${MEMBERSHIP}#Instructor`]), 'instructor');
  assertEquals(resolveGovernedLaunchActorType([`${MEMBERSHIP}#Administrator`]), 'administrator');
  assertEquals(
    resolveGovernedLaunchActorType([`${MEMBERSHIP}/Instructor#TeachingAssistant`]),
    'instructor',
  );
  assertEquals(
    resolveGovernedLaunchActorType([`${MEMBERSHIP}/Administrator#Support`]),
    'administrator',
  );
  assertEquals(
    resolveGovernedLaunchActorType([
      `${MEMBERSHIP}#Learner`,
      `${MEMBERSHIP}/Learner#Instructor`,
      'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',
      'http://purl.imsglobal.org/vocab/lis/v2/system/person#Administrator',
    ]),
    null,
  );
  for (
    const role of [
      'Instructor',
      'administrator',
      `${MEMBERSHIP}#NotAnInstructor`,
      `${MEMBERSHIP}/Instructor#Unknown`,
      `${MEMBERSHIP}/toString#Instructor`,
      `${MEMBERSHIP}/__proto__#Administrator`,
      `${MEMBERSHIP}/Administrator#Unknown`,
      `${MEMBERSHIP}/Instructor#TeachingAssistant#Learner`,
      `${MEMBERSHIP}#Instructor/anything`,
    ]
  ) {
    assertEquals(resolveGovernedLaunchActorType([role]), null, role);
  }
});

Deno.test('roster role normalization respects the principal context role', () => {
  assertEquals(parseLtiContextRole(`${MEMBERSHIP}/Learner#Instructor`), 'learner');
  assertEquals(parseLtiContextRole(`${MEMBERSHIP}/Instructor#Grader`), 'instructor');
  assertEquals(parseLtiContextRole(`${MEMBERSHIP}#Mentor`), 'other');
  assertEquals(
    parseLtiContextRole('http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor'),
    'other',
  );
});

import type { RosterRole } from '../../sdk/worker-app-sdk.ts';

const MEMBERSHIP = 'http://purl.imsglobal.org/vocab/lis/v2/membership';
const SUBROLES = new Map<string, readonly string[]>([
  ['Administrator', [
    'Administrator',
    'Developer',
    'ExternalDeveloper',
    'ExternalSupport',
    'ExternalSystemAdministrator',
    'Support',
    'SystemAdministrator',
  ]],
  ['Instructor', [
    'ExternalInstructor',
    'Grader',
    'GuestInstructor',
    'Lecturer',
    'PrimaryInstructor',
    'SecondaryInstructor',
    'TeachingAssistant',
    'TeachingAssistantGroup',
    'TeachingAssistantOffering',
    'TeachingAssistantSection',
    'TeachingAssistantSectionAssociation',
    'TeachingAssistantTemplate',
  ]],
  ['Learner', ['ExternalLearner', 'GuestLearner', 'Instructor', 'Learner', 'NonCreditLearner']],
]);

/** Maps only standard context roles; institution/system roles grant no course authority. */
export function parseLtiContextRole(value: string): RosterRole {
  let principal: string;
  if (value.startsWith(`${MEMBERSHIP}#`)) {
    principal = value.slice(MEMBERSHIP.length + 1);
  } else if (value.startsWith(`${MEMBERSHIP}/`)) {
    const parts = value.slice(MEMBERSHIP.length + 1).split('#');
    const [role, subrole] = parts;
    if (
      parts.length !== 2 || role === undefined || subrole === undefined ||
      !SUBROLES.get(role)?.includes(subrole)
    ) {
      return 'other';
    }
    principal = role;
  } else {
    return 'other';
  }
  switch (principal) {
    case 'Administrator':
      return 'administrator';
    case 'Instructor':
      return 'instructor';
    case 'Learner':
      return 'learner';
    default:
      return 'other';
  }
}

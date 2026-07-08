import type { DynamicRegistrationConfig } from '@longsightgroup/lti-tool';

export function buildDynamicRegistrationConfig(appOrigin: string): DynamicRegistrationConfig {
  return {
    url: appOrigin,
    name: 'Lantern',
    description: 'Launch approved Lantern learning activities through the governed runtime.',
    loginUri: `${appOrigin}/lti/login`,
    launchUri: `${appOrigin}/lti/launch`,
    jwksUri: `${appOrigin}/lti/jwks.json`,
    deepLinkingUri: `${appOrigin}/lti/deep-linking`,
    redirectUris: [
      `${appOrigin}/lti/launch`,
      `${appOrigin}/lti/deep-linking`,
      `${appOrigin}/lti/deep-linking?placement=resource_selection`,
    ],
    platforms: {
      canvas: {
        privacyLevel: 'public',
        toolId: 'lantern-demo-broker',
        resourceLinkPlacements: ['course_navigation'],
        deepLinkPlacements: ['assignment_selection', 'resource_selection'],
      },
      moodle: {
        deepLinkPlacements: ['assignment_selection'],
      },
      sakai: {
        resourceLinkPlacements: ['course_navigation'],
        deepLinkPlacements: ['assignment_selection'],
      },
    },
    customizeMessages: (_context, messages) =>
      messages.map((message) =>
        message.type === 'LtiDeepLinkingRequest' &&
          message.placements?.includes('resource_selection')
          ? {
            ...message,
            target_link_uri: `${appOrigin}/lti/deep-linking?placement=resource_selection`,
          }
          : message
      ),
  };
}

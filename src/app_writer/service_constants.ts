export const APP_GENERATION_AUDIT_EVENT_TYPES = [
  'app_generation.started',
  'app_generation.initializing',
  'app_generation.planning',
  'app_generation.generating',
  'app_generation.validating',
  'app_generation.repairing',
  'app_generation.previewing',
  'app_generation.saved_pending_version',
  'app_generation.failed',
] as const;

export type AppGenerationAuditEventType = (typeof APP_GENERATION_AUDIT_EVENT_TYPES)[number];

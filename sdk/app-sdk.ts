export type UserRole = "learner" | "instructor";

export type Capability =
  | "read_launch_context"
  | "read_activity_content"
  | "submit_attempt_event"
  | "finalize_attempt"
  | "read_local_state"
  | "write_local_state";

export interface LaunchContext {
  userRole: UserRole;
  courseId: string;
  assignmentId?: string;
  activityId: string;
}

export interface AppDescriptor {
  appId: string;
  version: string;
  capabilities: Capability[];
}

export interface SessionDescriptor {
  attemptId: string;
  token: string;
}

export interface BootstrapPayload {
  launch: {
    user_role: UserRole;
    course_id: string;
    assignment_id?: string;
    activity_id: string;
  };
  app: {
    app_id: string;
    version: string;
    capabilities: Capability[];
    runtime_contract_signature: string;
  };
  session: {
    attempt_id: string;
    token: string;
    expires_at: string;
  };
  signature: string;
}

export type AttemptEvent =
  | {
    type: "answer";
    questionId: string;
    answer: string | string[];
    timestamp: string;
  }
  | {
    type: "progress";
    checkpoint: string;
    value: number;
    timestamp: string;
  }
  | {
    type: "complete";
    timestamp: string;
  };

export interface GatewayAppClient {
  getLaunchContext(): Promise<LaunchContext>;
  getActivityContent<T = unknown>(): Promise<T>;
  readLocalState<T = unknown>(): Promise<T | null>;
  writeLocalState<T = unknown>(value: T): Promise<void>;
  emitAttemptEvent(event: AttemptEvent): Promise<void>;
  finalizeAttempt(input?: {
    completionState?: "completed" | "abandoned";
  }): Promise<{ accepted: true }>;
}

declare global {
  interface Window {
    GatewayApp?: GatewayAppClient;
    GatewayBootstrap?: BootstrapPayload;
  }
}

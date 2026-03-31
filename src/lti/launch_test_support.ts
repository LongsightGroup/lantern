import {
  isLaunchRejectionError,
  type LaunchRejection,
} from "./launch_rejection.ts";

export function expectLaunchRejection(error: unknown): LaunchRejection {
  if (!isLaunchRejectionError(error)) {
    throw error;
  }

  return (error as { rejection: LaunchRejection }).rejection;
}

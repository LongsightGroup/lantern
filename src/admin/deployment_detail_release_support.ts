import type { CanvasDeploymentBinding, DeploymentBinding } from '../lti/types.ts';
import type { ManagedDeploymentSlot } from './deployment_detail.ts';

export function describeSavedBindingChip(slot: ManagedDeploymentSlot): string {
  if (hasSavedBinding(slot)) {
    return 'Connected';
  }

  if (hasPendingCanvasRegistration(slot)) {
    return 'Waiting for first launch';
  }

  return 'Not connected';
}

export function hasSavedBinding(slot: ManagedDeploymentSlot): boolean {
  return slot.deployment.binding?.lms === slot.lms;
}

export function describeBindingStatusHeading(slot: ManagedDeploymentSlot): string {
  switch (slot.lms) {
    case 'canvas':
      if (hasPendingCanvasRegistration(slot)) {
        return 'Waiting for first Canvas launch';
      }

      if (getCanvasBinding(slot.deployment.binding) === null) {
        return 'Not connected';
      }

      return slot.deployment.enabledPackageVersionId === null
        ? 'Connected, choose a live version'
        : 'Connected and live';
    case 'moodle':
      return getMoodleBinding(slot.deployment.binding) === null
        ? 'Not connected'
        : slot.deployment.enabledPackageVersionId === null
          ? 'Connected, choose a live version'
          : 'Connected and live';
    case 'sakai':
      return getSakaiBinding(slot.deployment.binding) === null
        ? 'Not connected'
        : slot.deployment.enabledPackageVersionId === null
          ? 'Connected, choose a live version'
          : 'Connected and live';
  }
}

export function describeEditorCopy(lms: ManagedDeploymentSlot['lms']): string {
  switch (lms) {
    case 'canvas':
      return 'Start in Canvas Settings > Apps, choose the live version next, and open Advanced Canvas settings only if you need them.';
    case 'moodle':
      return 'Start with Moodle setup, then choose the live version for learners.';
    case 'sakai':
      return 'Start with Sakai setup, then choose the live version for learners.';
  }
}

export function describeManagedSlotIntro(lms: ManagedDeploymentSlot['lms']): string {
  switch (lms) {
    case 'canvas':
      return 'Use Dynamic Registration first. Open Advanced Canvas settings only if you need to enter values by hand.';
    case 'moodle':
      return 'Use the setup link first. Open Advanced Moodle settings only if you need to enter values by hand.';
    case 'sakai':
      return 'Use the setup link first. Open Advanced Sakai settings only if you need to enter values by hand.';
  }
}

export function formatLmsLabel(lms: ManagedDeploymentSlot['lms']): string {
  switch (lms) {
    case 'canvas':
      return 'Canvas';
    case 'moodle':
      return 'Moodle';
    case 'sakai':
      return 'Sakai';
  }
}

export function getCanvasBinding(
  binding: DeploymentBinding | null,
): CanvasDeploymentBinding | null {
  return binding?.lms === 'canvas' ? binding : null;
}

export function hasPendingCanvasRegistration(slot: ManagedDeploymentSlot): boolean {
  return (
    slot.lms === 'canvas' && slot.persisted && getCanvasBinding(slot.deployment.binding) === null
  );
}

export function getMoodleBinding(
  binding: DeploymentBinding | null,
): Extract<DeploymentBinding, { lms: 'moodle' }> | null {
  return binding?.lms === 'moodle' ? binding : null;
}

export function getSakaiBinding(
  binding: DeploymentBinding | null,
): Extract<DeploymentBinding, { lms: 'sakai' }> | null {
  return binding?.lms === 'sakai' ? binding : null;
}

export function describeBindingValue(value: string | null | undefined): string {
  if (!value) {
    return 'Not saved yet';
  }

  return value;
}

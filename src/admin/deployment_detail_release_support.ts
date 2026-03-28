import type { CanvasDeploymentBinding, DeploymentBinding } from '../lti/types.ts';
import type { ManagedDeploymentSlot } from './deployment_detail.ts';

export function describeSavedBindingChip(slot: ManagedDeploymentSlot): string {
  if (hasSavedBinding(slot)) {
    return 'Binding saved';
  }

  if (hasPendingCanvasRegistration(slot)) {
    return 'Registration saved, awaiting first launch';
  }

  return 'Binding not saved yet';
}

export function hasSavedBinding(slot: ManagedDeploymentSlot): boolean {
  return slot.deployment.binding?.lms === slot.lms;
}

export function describeBindingStatusHeading(slot: ManagedDeploymentSlot): string {
  switch (slot.lms) {
    case 'canvas':
      if (hasPendingCanvasRegistration(slot)) {
        return 'Canvas registration saved, first launch still needed';
      }

      if (getCanvasBinding(slot.deployment.binding) === null) {
        return 'Canvas binding not saved yet';
      }

      return slot.deployment.enabledPackageVersionId === null
        ? 'Canvas binding saved, finish release setup'
        : 'Launch-ready configuration saved';
    case 'moodle':
      return getMoodleBinding(slot.deployment.binding) === null
        ? 'Moodle binding not saved yet'
        : 'Exact Moodle binding saved';
    case 'sakai':
      return getSakaiBinding(slot.deployment.binding) === null
        ? 'Sakai binding not saved yet'
        : 'Exact Sakai binding saved';
  }
}

export function describeEditorCopy(lms: ManagedDeploymentSlot['lms']): string {
  switch (lms) {
    case 'canvas':
      return 'Dynamic registration, config export, roster check, and the active release pin for this Canvas slot.';
    case 'moodle':
      return 'Exact platform values first, then the release pin for this Moodle slot.';
    case 'sakai':
      return 'Exact platform values first, then the release pin for this Sakai slot.';
  }
}

export function describeManagedSlotIntro(lms: ManagedDeploymentSlot['lms']): string {
  switch (lms) {
    case 'canvas':
      return 'Keep Canvas registration, config export, saved environment, and roster verification on the same page.';
    case 'moodle':
      return 'Save the exact Moodle binding values here without Canvas-only copy or guessed endpoints.';
    case 'sakai':
      return 'Save the exact Sakai binding values here and keep the admin-facing deployment_id guidance explicit.';
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

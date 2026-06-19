export function isGenerationTimeoutMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return normalized.includes('timeout') || normalized.includes('timed out');
}

export function isWorkspaceHarnessContractMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('invalid json') ||
    normalized.includes('normalizedrequest') ||
    normalized.includes('appplan') ||
    normalized.includes('fileedits') ||
    normalized.includes('workspaceharnessmodelresult') ||
    normalized.includes('structured response') ||
    normalized.includes('selectedstarterid') ||
    normalized.includes('progressupdates')
  );
}

export function isGenerationProviderInternalErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('3045') ||
    normalized.includes('8008') ||
    normalized.includes('internal server error') ||
    normalized.includes('unknown internal error')
  );
}

export function isGenerationProviderCapacityErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('3040') ||
    normalized.includes('capacity temporarily exceeded') ||
    normalized.includes('temporarily overloaded')
  );
}

export function classifyProviderErrorCode(message: string): string | null {
  if (isGenerationTimeoutMessage(message)) {
    return 'timeout';
  }

  if (isWorkspaceHarnessContractMessage(message)) {
    return 'workspace_harness_contract';
  }

  if (isGenerationProviderInternalErrorMessage(message)) {
    return 'internal_server_error';
  }

  if (isGenerationProviderCapacityErrorMessage(message)) {
    return 'capacity_exceeded';
  }

  return null;
}

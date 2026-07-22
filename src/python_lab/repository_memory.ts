import type {
  CodeAssignmentDefinitionRecord,
  CodeSubmissionRunRecord,
  PythonLabAccessRequestRecord,
  PythonLabRecord,
  PythonLabRepository,
} from './repository.ts';

export function createInMemoryPythonLabRepository(input: {
  readonly labs?: readonly PythonLabRecord[];
  readonly definitions?: readonly CodeAssignmentDefinitionRecord[];
  readonly runs?: readonly CodeSubmissionRunRecord[];
  readonly accessRequests?: readonly PythonLabAccessRequestRecord[];
} = {}): PythonLabRepository {
  const labs = [...(input.labs ?? [])];
  const definitions = [...(input.definitions ?? [])];
  const runs = [...(input.runs ?? [])];
  const accessRequests = [...(input.accessRequests ?? [])];
  const ipWindowReservations = new Set<string>();

  return {
    async reserveLab(input) {
      await Promise.resolve();
      if (
        labs.some((lab) =>
          lab.visitorHash === input.lab.visitorHash &&
          lab.createdAt.slice(0, 10) === input.visitorDay
        )
      ) {
        return { status: 'visitor_limited' };
      }

      if (input.lab.requestIpHash !== null && input.ipWindowStartedAt !== null) {
        const key = `${input.lab.requestIpHash}:${input.ipWindowStartedAt}`;

        if (ipWindowReservations.has(key)) {
          return { status: 'ip_limited' };
        }

        ipWindowReservations.add(key);
      }

      labs.push(structuredClone(input.lab));
      return { status: 'accepted', lab: structuredClone(input.lab) };
    },
    async getLabById(labId) {
      await Promise.resolve();
      return cloneOrNull(labs.find((lab) => lab.labId === labId));
    },
    async markLabReady(input) {
      await Promise.resolve();
      return updateLab(labs, input.labId, (lab) => ({
        ...lab,
        state: 'ready',
        packageVersionId: input.packageVersionId,
        privateArtifactKey: input.privateArtifactKey,
        failureMessage: null,
        updatedAt: input.updatedAt,
      }));
    },
    async markLabFailed(input) {
      await Promise.resolve();
      return updateLab(labs, input.labId, (lab) => ({
        ...lab,
        state: 'failed',
        packageVersionId: input.packageVersionId ?? lab.packageVersionId,
        failureMessage: input.failureMessage,
        updatedAt: input.updatedAt,
      }));
    },
    async listExpiredLabs(now) {
      await Promise.resolve();
      return labs.filter((lab) => lab.expiresAt <= now).map((lab) => structuredClone(lab));
    },
    async deleteLab(labId) {
      await Promise.resolve();
      removeBy(labs, (lab) => lab.labId === labId);
    },
    async createCodeAssignmentDefinition(record) {
      await Promise.resolve();
      if (
        definitions.some((definition) => definition.packageVersionId === record.packageVersionId)
      ) {
        throw new Error('A Python assignment definition already exists for this package version.');
      }
      definitions.push(structuredClone(record));
      return structuredClone(record);
    },
    async getCodeAssignmentDefinitionByPackageVersionId(packageVersionId) {
      await Promise.resolve();
      return cloneOrNull(
        definitions.find((definition) => definition.packageVersionId === packageVersionId),
      );
    },
    async reserveCodeSubmissionRun(record) {
      await Promise.resolve();
      const existing = runs.find((run) =>
        run.attemptId === record.attemptId && run.phase === 'final'
      );
      if (existing !== undefined) {
        return { status: 'existing', run: structuredClone(existing) };
      }
      runs.push(structuredClone(record));
      return { status: 'created', run: structuredClone(record) };
    },
    async markCodeSubmissionSourcePersisted(input) {
      await Promise.resolve();
      return updateRun(runs, input.runId, (run) => ({
        ...run,
        sourcePersistedAt: input.sourcePersistedAt,
      }));
    },
    async deleteUnpersistedCodeSubmissionRun(runId) {
      await Promise.resolve();
      removeBy(runs, (run) => run.runId === runId && run.sourcePersistedAt === null);
    },
    async getFinalCodeSubmissionRunByAttemptId(attemptId) {
      await Promise.resolve();
      return cloneOrNull(runs.find((run) => run.attemptId === attemptId && run.phase === 'final'));
    },
    async listSubmissionArtifactKeysByPackageVersionId(_packageVersionId) {
      await Promise.resolve();
      return runs.map((run) => run.sourceArtifactKey);
    },
    async createAccessRequest(record) {
      await Promise.resolve();
      accessRequests.push(structuredClone(record));
      return structuredClone(record);
    },
    async listAccessRequests() {
      await Promise.resolve();
      return accessRequests.map((request) => structuredClone(request)).sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      );
    },
    async updateAccessRequestStatus(input) {
      await Promise.resolve();
      const index = accessRequests.findIndex((request) => request.requestId === input.requestId);
      if (index < 0) {
        throw new Error('Python Lab access request was not found.');
      }
      const existing = accessRequests[index]!;
      const next = { ...existing, status: input.status, updatedAt: input.updatedAt };
      accessRequests.splice(index, 1, next);
      return structuredClone(next);
    },
    async listExpiredAccessRequests(now) {
      await Promise.resolve();
      return accessRequests.filter((request) => request.expiresAt <= now).map((request) =>
        structuredClone(request)
      );
    },
    async deleteAccessRequest(requestId) {
      await Promise.resolve();
      removeBy(accessRequests, (request) => request.requestId === requestId);
    },
  };
}

function updateRun(
  runs: CodeSubmissionRunRecord[],
  runId: string,
  update: (run: CodeSubmissionRunRecord) => CodeSubmissionRunRecord,
): CodeSubmissionRunRecord {
  const index = runs.findIndex((run) => run.runId === runId);
  if (index < 0) {
    throw new Error('Python submission run was not found.');
  }
  const next = update(runs[index]!);
  runs.splice(index, 1, next);
  return structuredClone(next);
}

function updateLab(
  labs: PythonLabRecord[],
  labId: string,
  update: (lab: PythonLabRecord) => PythonLabRecord,
): PythonLabRecord {
  const index = labs.findIndex((lab) => lab.labId === labId);
  if (index < 0) {
    throw new Error('Python Lab was not found.');
  }
  const next = update(labs[index]!);
  labs.splice(index, 1, next);
  return structuredClone(next);
}

function cloneOrNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : structuredClone(value);
}

function removeBy<T>(items: T[], predicate: (item: T) => boolean): void {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) {
      items.splice(index, 1);
    }
  }
}

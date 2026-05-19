import type {
  AttemptEventRecord,
  AttemptRecord,
  GradePublicationRecord,
} from '../package_review/types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';

export interface InstructorReport {
  appId: string;
  generatedAt: string;
  summary: InstructorReportSummary;
  dailyActivity: InstructorReportDailyActivity[];
  eventMix: InstructorReportEventMix[];
  scoreDistribution: InstructorReportScoreBucket[];
  itemActivity: InstructorReportItemActivity[];
  students: InstructorReportStudent[];
  followUpStudents: InstructorReportStudent[];
  recentAttempts: InstructorReportAttempt[];
}

export interface InstructorReportSummary {
  learnerCount: number;
  attemptCount: number;
  completedAttemptCount: number;
  inProgressAttemptCount: number;
  answerEventCount: number;
  progressEventCount: number;
  completeEventCount: number;
  totalEventCount: number;
  scoredAttemptCount: number;
  completionRatePercent: number;
  averageScorePercent: number | null;
  latestActivityAt: string | null;
}

export interface InstructorReportDailyActivity {
  day: string;
  attemptCount: number;
  completedAttemptCount: number;
}

export interface InstructorReportEventMix {
  label: string;
  count: number;
}

export interface InstructorReportScoreBucket {
  label: string;
  count: number;
}

export interface InstructorReportItemActivity {
  questionId: string;
  answerEventCount: number;
  latestAnsweredAt: string;
}

export type InstructorReportStudentSignal = 'on_track' | 'in_progress' | 'needs_follow_up';

export interface InstructorReportStudent {
  userId: string;
  displayName: string;
  email: string | null;
  login: string | null;
  attemptCount: number;
  completedAttemptCount: number;
  answerEventCount: number;
  progressEventCount: number;
  completeEventCount: number;
  totalEventCount: number;
  completionRatePercent: number;
  latestActivityAt: string | null;
  latestScorePercent: number | null;
  latestAttemptStatus: AttemptRecord['status'];
  signal: InstructorReportStudentSignal;
}

export interface InstructorReportAttempt {
  attempt: AttemptRecord;
  eventCount: number;
  answerEventCount: number;
  progressEventCount: number;
  completeEventCount: number;
  answeredQuestionIds: string[];
  latestEventAt: string | null;
  gradePublication: GradePublicationRecord | null;
  scorePercent: number | null;
}

export async function buildInstructorReport(input: {
  repository: PackageReviewRepository;
  appId: string;
  generatedAt: string;
}): Promise<InstructorReport> {
  const attempts = (await input.repository.listAttemptsByApp(input.appId)).filter(
    (attempt) => attempt.userRole === 'learner',
  );
  const reportAttempts = await Promise.all(
    attempts.map(async (attempt) => {
      const [events, gradePublication] = await Promise.all([
        input.repository.listAttemptEvents(attempt.attemptId),
        input.repository.getGradePublicationByAttemptId(attempt.attemptId),
      ]);

      return summarizeAttempt(attempt, events, gradePublication);
    }),
  );

  const students = summarizeStudents(reportAttempts);

  return {
    appId: input.appId,
    generatedAt: input.generatedAt,
    summary: summarizeReport(reportAttempts),
    dailyActivity: summarizeDailyActivity(reportAttempts),
    eventMix: summarizeEventMix(reportAttempts),
    scoreDistribution: summarizeScoreDistribution(reportAttempts),
    itemActivity: summarizeItemActivity(reportAttempts),
    students,
    followUpStudents: students
      .filter((student) => student.signal === 'needs_follow_up')
      .slice(0, 6),
    recentAttempts: reportAttempts.slice(0, 12),
  };
}

function summarizeAttempt(
  attempt: AttemptRecord,
  events: AttemptEventRecord[],
  gradePublication: GradePublicationRecord | null,
): InstructorReportAttempt {
  const answerEventCount = events.filter((event) => event.learningVerb === 'answered').length;
  const progressEventCount = events.filter((event) => event.learningVerb === 'progressed').length;
  const completeEventCount = events.filter((event) => event.learningVerb === 'completed').length;
  const answeredQuestionIds = events.flatMap((event) =>
    event.learningVerb === 'answered' && event.objectType === 'question' ? [event.objectId] : []
  );
  const latestEventAt = events.length === 0 ? null : events.reduce(
    (latest, event) => event.receivedAt.localeCompare(latest) > 0 ? event.receivedAt : latest,
    events[0]!.receivedAt,
  );

  return {
    attempt,
    eventCount: events.length,
    answerEventCount,
    progressEventCount,
    completeEventCount,
    answeredQuestionIds,
    latestEventAt,
    gradePublication,
    scorePercent: scorePercent(gradePublication),
  };
}

function summarizeReport(attempts: InstructorReportAttempt[]): InstructorReportSummary {
  const scores = attempts
    .map((attempt) => attempt.scorePercent)
    .filter((score): score is number => score !== null);

  return {
    learnerCount: new Set(attempts.map((attempt) => attempt.attempt.userId)).size,
    attemptCount: attempts.length,
    completedAttemptCount: attempts.filter((attempt) => attempt.attempt.status === 'completed')
      .length,
    inProgressAttemptCount: attempts.filter((attempt) => attempt.attempt.status === 'in_progress')
      .length,
    answerEventCount: sum(attempts.map((attempt) => attempt.answerEventCount)),
    progressEventCount: sum(attempts.map((attempt) => attempt.progressEventCount)),
    completeEventCount: sum(attempts.map((attempt) => attempt.completeEventCount)),
    totalEventCount: sum(attempts.map((attempt) => attempt.eventCount)),
    scoredAttemptCount: scores.length,
    completionRatePercent: attempts.length === 0
      ? 0
      : (attempts.filter((attempt) => attempt.attempt.status === 'completed').length /
        attempts.length) *
        100,
    averageScorePercent: scores.length === 0
      ? null
      : scores.reduce((total, score) => total + score, 0) / scores.length,
    latestActivityAt: maxTimestamp(
      attempts.flatMap((attempt) => [
        attempt.attempt.startedAt,
        attempt.attempt.finalizedAt,
        attempt.latestEventAt,
      ]),
    ),
  };
}

function summarizeDailyActivity(
  attempts: InstructorReportAttempt[],
): InstructorReportDailyActivity[] {
  const byDay = new Map<string, InstructorReportDailyActivity>();

  for (const attempt of attempts) {
    const day = attempt.attempt.startedAt.slice(0, 10);
    const existing = byDay.get(day) ?? {
      day,
      attemptCount: 0,
      completedAttemptCount: 0,
    };

    byDay.set(day, {
      ...existing,
      attemptCount: existing.attemptCount + 1,
      completedAttemptCount: existing.completedAttemptCount +
        (attempt.attempt.status === 'completed' ? 1 : 0),
    });
  }

  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day)).slice(-14);
}

function summarizeEventMix(attempts: InstructorReportAttempt[]): InstructorReportEventMix[] {
  return [
    {
      label: 'Answers',
      count: sum(attempts.map((attempt) => attempt.answerEventCount)),
    },
    {
      label: 'Progress',
      count: sum(attempts.map((attempt) => attempt.progressEventCount)),
    },
    {
      label: 'Completion',
      count: sum(attempts.map((attempt) => attempt.completeEventCount)),
    },
  ];
}

function summarizeScoreDistribution(
  attempts: InstructorReportAttempt[],
): InstructorReportScoreBucket[] {
  const buckets: InstructorReportScoreBucket[] = [
    { label: '80-100%', count: 0 },
    { label: '60-79%', count: 0 },
    { label: '0-59%', count: 0 },
    { label: 'Unscored', count: 0 },
  ];

  for (const attempt of attempts) {
    if (attempt.scorePercent === null) {
      buckets[3]!.count += 1;
    } else if (attempt.scorePercent >= 80) {
      buckets[0]!.count += 1;
    } else if (attempt.scorePercent >= 60) {
      buckets[1]!.count += 1;
    } else {
      buckets[2]!.count += 1;
    }
  }

  return buckets;
}

function summarizeItemActivity(
  attempts: InstructorReportAttempt[],
): InstructorReportItemActivity[] {
  const byQuestion = new Map<string, InstructorReportItemActivity>();

  for (const attempt of attempts) {
    for (const questionId of attempt.answeredQuestionIds) {
      const existing = byQuestion.get(questionId);
      byQuestion.set(questionId, {
        questionId,
        answerEventCount: (existing?.answerEventCount ?? 0) + 1,
        latestAnsweredAt:
          maxTimestamp([existing?.latestAnsweredAt ?? null, attempt.latestEventAt]) ??
            attempt.attempt.startedAt,
      });
    }
  }

  return [...byQuestion.values()]
    .sort(
      (left, right) =>
        right.answerEventCount - left.answerEventCount ||
        right.latestAnsweredAt.localeCompare(left.latestAnsweredAt) ||
        left.questionId.localeCompare(right.questionId),
    )
    .slice(0, 8);
}

function summarizeStudents(attempts: InstructorReportAttempt[]): InstructorReportStudent[] {
  const byUser = new Map<string, InstructorReportAttempt[]>();

  for (const attempt of attempts) {
    const current = byUser.get(attempt.attempt.userId) ?? [];
    current.push(attempt);
    byUser.set(attempt.attempt.userId, current);
  }

  return [...byUser.entries()]
    .map(([userId, userAttempts]) => summarizeStudent(userId, userAttempts))
    .sort(
      (left, right) =>
        (right.latestActivityAt ?? '').localeCompare(left.latestActivityAt ?? '') ||
        left.displayName.localeCompare(right.displayName),
    );
}

function summarizeStudent(
  userId: string,
  attempts: InstructorReportAttempt[],
): InstructorReportStudent {
  const sortedAttempts = attempts.toSorted((left, right) =>
    right.attempt.startedAt.localeCompare(left.attempt.startedAt)
  );
  const latestAttempt = sortedAttempts[0]!;
  const latestScoredAttempt = sortedAttempts.find((attempt) => attempt.scorePercent !== null) ??
    null;
  const completedAttemptCount = attempts.filter(
    (attempt) => attempt.attempt.status === 'completed',
  ).length;

  return {
    userId,
    displayName: latestAttempt.attempt.userDisplayName ??
      latestAttempt.attempt.userLogin ??
      latestAttempt.attempt.userEmail ??
      userId,
    email: latestAttempt.attempt.userEmail,
    login: latestAttempt.attempt.userLogin,
    attemptCount: attempts.length,
    completedAttemptCount,
    answerEventCount: sum(attempts.map((attempt) => attempt.answerEventCount)),
    progressEventCount: sum(attempts.map((attempt) => attempt.progressEventCount)),
    completeEventCount: sum(attempts.map((attempt) => attempt.completeEventCount)),
    totalEventCount: sum(attempts.map((attempt) => attempt.eventCount)),
    completionRatePercent: attempts.length === 0
      ? 0
      : (completedAttemptCount / attempts.length) * 100,
    latestActivityAt: maxTimestamp(
      attempts.flatMap((attempt) => [
        attempt.attempt.startedAt,
        attempt.attempt.finalizedAt,
        attempt.latestEventAt,
      ]),
    ),
    latestScorePercent: latestScoredAttempt?.scorePercent ?? null,
    latestAttemptStatus: latestAttempt.attempt.status,
    signal: classifyStudentSignal({
      completedAttemptCount,
      latestScorePercent: latestScoredAttempt?.scorePercent ?? null,
      latestAttemptStatus: latestAttempt.attempt.status,
    }),
  };
}

function classifyStudentSignal(input: {
  completedAttemptCount: number;
  latestScorePercent: number | null;
  latestAttemptStatus: AttemptRecord['status'];
}): InstructorReportStudentSignal {
  if (
    (input.latestScorePercent !== null && input.latestScorePercent < 70) ||
    (input.completedAttemptCount === 0 && input.latestAttemptStatus !== 'completed')
  ) {
    return 'needs_follow_up';
  }

  if (input.latestAttemptStatus === 'in_progress') {
    return 'in_progress';
  }

  return 'on_track';
}

function scorePercent(gradePublication: GradePublicationRecord | null): number | null {
  if (gradePublication === null || gradePublication.scoreMaximum <= 0) {
    return null;
  }

  return (gradePublication.scoreGiven / gradePublication.scoreMaximum) * 100;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function maxTimestamp(values: Array<string | null>): string | null {
  const timestamps = values.filter((value): value is string => value !== null);

  if (timestamps.length === 0) {
    return null;
  }

  return timestamps.reduce((latest, value) => (value.localeCompare(latest) > 0 ? value : latest));
}

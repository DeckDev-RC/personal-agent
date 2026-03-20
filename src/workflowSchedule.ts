import type { WorkflowSchedule } from "./types/workflow.js";

type WorkflowScheduleMode = WorkflowSchedule["mode"];

type CronFieldMatcher = {
  wildcard: boolean;
  matches: (value: number) => boolean;
};

type ParsedCronExpression = {
  minute: CronFieldMatcher;
  hour: CronFieldMatcher;
  dayOfMonth: CronFieldMatcher;
  month: CronFieldMatcher;
  dayOfWeek: CronFieldMatcher;
};

const CRON_FIELD_DEFINITIONS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day-of-week", min: 0, max: 7 },
] as const;

const MAX_CRON_LOOKAHEAD_MINUTES = 366 * 24 * 60;

function normalizeIntervalMinutes(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 60;
  }
  return Math.max(1, Math.round(parsed));
}

function normalizeCronExpression(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function resolveWorkflowScheduleMode(
  schedule?: Partial<WorkflowSchedule> | null,
): WorkflowScheduleMode {
  if (schedule?.mode === "cron" || normalizeCronExpression(schedule?.cronExpression)) {
    return "cron";
  }
  return "interval";
}

export function normalizeWorkflowSchedule(
  schedule?: Partial<WorkflowSchedule> | null,
): WorkflowSchedule | undefined {
  if (!schedule) {
    return undefined;
  }

  const mode = resolveWorkflowScheduleMode(schedule);

  return {
    enabled: Boolean(schedule.enabled),
    mode,
    intervalMinutes: mode === "interval" ? normalizeIntervalMinutes(schedule.intervalMinutes) : undefined,
    cronExpression: mode === "cron" ? normalizeCronExpression(schedule.cronExpression) : undefined,
    nextRunAt: typeof schedule.nextRunAt === "number" ? schedule.nextRunAt : undefined,
    lastRunAt: typeof schedule.lastRunAt === "number" ? schedule.lastRunAt : undefined,
    retryOnFailure: schedule.retryOnFailure === true,
    maxRetries:
      typeof schedule.maxRetries === "number" && Number.isFinite(schedule.maxRetries)
        ? Math.max(0, Math.round(schedule.maxRetries))
        : undefined,
  };
}

function range(start: number, end: number, step: number): number[] {
  const values: number[] = [];
  for (let current = start; current <= end; current += step) {
    values.push(current);
  }
  return values;
}

function normalizeDayOfWeek(value: number): number {
  return value === 7 ? 0 : value;
}

function parseCronNumber(value: string, min: number, max: number, fieldName: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${fieldName} value "${value}".`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid ${fieldName} value "${value}". Expected ${min}-${max}.`);
  }

  return parsed;
}

function parseCronPart(
  part: string,
  min: number,
  max: number,
  fieldName: string,
): CronFieldMatcher {
  const trimmed = part.trim();
  if (!trimmed) {
    throw new Error(`Missing ${fieldName} field.`);
  }

  const wildcard = trimmed === "*";
  const allowed = new Set<number>();

  for (const segment of trimmed.split(",")) {
    const token = segment.trim();
    if (!token) {
      throw new Error(`Invalid ${fieldName} token in "${trimmed}".`);
    }

    const [base, rawStep] = token.split("/");
    const step =
      rawStep === undefined
        ? 1
        : parseCronNumber(rawStep, 1, max - min + 1, `${fieldName} step`);

    if (base === "*") {
      for (const value of range(min, max, step)) {
        allowed.add(fieldName === "day-of-week" ? normalizeDayOfWeek(value) : value);
      }
      continue;
    }

    const rangeMatch = base.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseCronNumber(rangeMatch[1], min, max, `${fieldName} start`);
      const end = parseCronNumber(rangeMatch[2], min, max, `${fieldName} end`);
      if (end < start) {
        throw new Error(`Invalid ${fieldName} range "${base}".`);
      }
      for (const value of range(start, end, step)) {
        allowed.add(fieldName === "day-of-week" ? normalizeDayOfWeek(value) : value);
      }
      continue;
    }

    if (rawStep !== undefined) {
      throw new Error(`Invalid ${fieldName} token "${token}".`);
    }

    const single = parseCronNumber(base, min, max, fieldName);
    allowed.add(fieldName === "day-of-week" ? normalizeDayOfWeek(single) : single);
  }

  return {
    wildcard,
    matches: (value: number) => allowed.has(fieldName === "day-of-week" ? normalizeDayOfWeek(value) : value),
  };
}

function parseCronExpression(expression: string): ParsedCronExpression {
  const normalized = normalizeCronExpression(expression);
  const parts = normalized.split(" ");

  if (parts.length !== 5) {
    throw new Error("Cron expression must have 5 fields: minute hour day-of-month month day-of-week.");
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return {
    minute: parseCronPart(minute, 0, 59, "minute"),
    hour: parseCronPart(hour, 0, 23, "hour"),
    dayOfMonth: parseCronPart(dayOfMonth, 1, 31, "day-of-month"),
    month: parseCronPart(month, 1, 12, "month"),
    dayOfWeek: parseCronPart(dayOfWeek, 0, 7, "day-of-week"),
  };
}

function matchesCronDate(parsed: ParsedCronExpression, date: Date): boolean {
  const dayOfMonthMatches = parsed.dayOfMonth.matches(date.getDate());
  const dayOfWeekMatches = parsed.dayOfWeek.matches(date.getDay());
  const eitherDayFieldRestricted = !parsed.dayOfMonth.wildcard && !parsed.dayOfWeek.wildcard;
  const dayMatches = eitherDayFieldRestricted
    ? dayOfMonthMatches || dayOfWeekMatches
    : dayOfMonthMatches && dayOfWeekMatches;

  return (
    parsed.minute.matches(date.getMinutes()) &&
    parsed.hour.matches(date.getHours()) &&
    parsed.month.matches(date.getMonth() + 1) &&
    dayMatches
  );
}

function computeNextCronRunAt(expression: string, from: number): number {
  const parsed = parseCronExpression(expression);
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  for (let index = 0; index < MAX_CRON_LOOKAHEAD_MINUTES; index += 1) {
    if (matchesCronDate(parsed, cursor)) {
      return cursor.getTime();
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  throw new Error("Unable to resolve the next cron execution within the supported range.");
}

export function validateWorkflowSchedule(
  schedule?: Partial<WorkflowSchedule> | null,
): { valid: boolean; error?: string } {
  const normalized = normalizeWorkflowSchedule(schedule);
  if (!normalized?.enabled) {
    return { valid: true };
  }

  if (normalized.mode === "cron") {
    if (!normalized.cronExpression) {
      return { valid: false, error: "Cron expression is required." };
    }

    try {
      parseCronExpression(normalized.cronExpression);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (!normalized.intervalMinutes || normalized.intervalMinutes < 1) {
    return { valid: false, error: "Interval must be at least 1 minute." };
  }

  return { valid: true };
}

export function describeWorkflowSchedule(
  schedule?: Partial<WorkflowSchedule> | null,
): string {
  const normalized = normalizeWorkflowSchedule(schedule);
  if (!normalized?.enabled) {
    return "Disabled";
  }

  if (normalized.mode === "cron") {
    return normalized.cronExpression
      ? `Cron: ${normalized.cronExpression}`
      : "Cron schedule";
  }

  const minutes = normalized.intervalMinutes ?? 60;
  if (minutes === 1) {
    return "Every minute";
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "Every hour" : `Every ${hours} hours`;
  }
  return `Every ${minutes} minutes`;
}

export function computeNextWorkflowScheduleRunAt(params: {
  schedule: Partial<WorkflowSchedule>;
  from?: number;
  retryAttempt?: number;
}): number {
  const normalized = normalizeWorkflowSchedule(params.schedule);
  if (!normalized?.enabled) {
    throw new Error("Schedule is disabled.");
  }

  const from = params.from ?? Date.now();
  if (params.retryAttempt && params.retryAttempt > 0) {
    const delayMinutes = Math.min(2 ** (params.retryAttempt - 1), 30);
    return from + delayMinutes * 60_000;
  }

  if (normalized.mode === "cron") {
    if (!normalized.cronExpression) {
      throw new Error("Cron expression is required.");
    }
    return computeNextCronRunAt(normalized.cronExpression, from);
  }

  return from + (normalized.intervalMinutes ?? 60) * 60_000;
}

export function getNextWorkflowScheduleRunAt(
  schedule?: Partial<WorkflowSchedule> | null,
  from = Date.now(),
): number | undefined {
  const validation = validateWorkflowSchedule(schedule);
  if (!validation.valid || !schedule?.enabled) {
    return undefined;
  }

  return computeNextWorkflowScheduleRunAt({
    schedule,
    from,
  });
}

export function listCronExamples(): string[] {
  return [
    "0 8 * * 1-5",
    "0 9 * * *",
    "*/30 * * * *",
  ];
}

export function isWorkflowScheduleFieldName(value: string): boolean {
  return CRON_FIELD_DEFINITIONS.some((field) => field.name === value);
}

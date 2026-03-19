import { randomUUID } from "node:crypto";
import type { JobKind, JobRecord } from "../../src/types/runtime.js";
import { createJobRecord, updateJobRecord } from "./v2SessionStore.js";

type EnqueueJobParams = {
  kind: JobKind;
  scopeType: JobRecord["scopeType"];
  scopeId: string;
  payload?: Record<string, unknown>;
  run: (job: JobRecord) => Promise<string | void>;
  onUpdate?: (job: JobRecord) => void;
};

const scopeChains = new Map<string, Promise<void>>();

function scopeKey(scopeType: JobRecord["scopeType"], scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}

export async function enqueueScopedJob(params: EnqueueJobParams): Promise<JobRecord> {
  const job = await createJobRecord({
    jobId: randomUUID(),
    kind: params.kind,
    scopeType: params.scopeType,
    scopeId: params.scopeId,
    status: "queued",
    payload: params.payload,
  });
  params.onUpdate?.(job);

  const key = scopeKey(params.scopeType, params.scopeId);
  const previous = scopeChains.get(key) ?? Promise.resolve();
  const current = previous
    .catch(() => {
      // Keep queue alive even if the previous job failed.
    })
    .then(async () => {
      const started = await updateJobRecord(job.jobId, {
        status: "running",
        startedAt: Date.now(),
      });
      if (started) {
        params.onUpdate?.(started);
      }

      try {
        const resultSummary = (await params.run(started ?? job)) ?? undefined;
        const completed = await updateJobRecord(job.jobId, {
          status: "completed",
          completedAt: Date.now(),
          resultSummary,
        });
        if (completed) {
          params.onUpdate?.(completed);
        }
      } catch (error) {
        const failed = await updateJobRecord(job.jobId, {
          status: "failed",
          completedAt: Date.now(),
          error: error instanceof Error ? error.message : String(error),
        });
        if (failed) {
          params.onUpdate?.(failed);
        }
      }
    })
    .finally(() => {
      if (scopeChains.get(key) === current) {
        scopeChains.delete(key);
      }
    });

  scopeChains.set(key, current);
  return job;
}

import { EventEmitter } from "node:events";
import type { DaemonEnvelope } from "../../src/types/daemon.js";
import type { JobRecord } from "../../src/types/runtime.js";
import type { RuntimeEvent } from "../services/runtimeExecutor.js";

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export function subscribeDaemonEvents(
  listener: (event: DaemonEnvelope) => void,
): () => void {
  emitter.on("event", listener);
  return () => emitter.off("event", listener);
}

export function publishDaemonEvent(event: DaemonEnvelope): void {
  emitter.emit("event", event);
}

export function publishRuntimeEvent(event: RuntimeEvent): void {
  switch (event.type) {
    case "text_delta":
      publishDaemonEvent({
        event: "run.delta",
        data: {
          runId: event.runId,
          sessionId: event.sessionId,
          phase: event.phase,
          stream: "text",
          delta: event.delta,
        },
      });
      break;
    case "thinking_delta":
      publishDaemonEvent({
        event: "run.delta",
        data: {
          runId: event.runId,
          sessionId: event.sessionId,
          phase: event.phase,
          stream: "thinking",
          delta: event.delta,
        },
      });
      break;
    case "toolcall":
      publishDaemonEvent({
        event: "run.tool_call",
        data: event,
      });
      break;
    case "toolresult":
      publishDaemonEvent({
        event: "run.tool_result",
        data: event,
      });
      break;
    case "approval_required":
      publishDaemonEvent({
        event: "run.approval_required",
        data: event,
      });
      break;
    case "artifact":
      publishDaemonEvent({
        event: "run.artifact_created",
        data: event,
      });
      break;
    case "done":
      publishDaemonEvent({
        event: "run.completed",
        data: event,
      });
      break;
    case "error":
      publishDaemonEvent({
        event: "run.failed",
        data: event,
      });
      break;
    default:
      break;
  }
}

export function publishJobUpdate(job: JobRecord): void {
  publishDaemonEvent({
    event: "job.updated",
    data: { job },
  });
}

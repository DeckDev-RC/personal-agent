import { splitModelRef } from "../types/model.js";

type ModelCarrier = {
  model?: string | null;
};

export function resolveAgentModel(
  agent: ModelCarrier | null | undefined,
  defaultModelRef: string,
): string {
  const rawModel = typeof agent?.model === "string" ? agent.model.trim() : "";
  return splitModelRef(rawModel || defaultModelRef).modelRef;
}

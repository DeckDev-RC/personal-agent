import { createOpenAICompatibleProvider } from "./openaiCompatible.js";

export const xaiProvider = createOpenAICompatibleProvider({
  name: "xai",
  displayName: "xAI",
  defaultModel: "grok-3-mini",
  supportedModels: [
    "grok-3-mini",
    "grok-3",
  ],
  baseUrl: "https://api.x.ai/v1",
  capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
});

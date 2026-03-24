import { createOpenAICompatibleProvider } from "./openaiCompatible.js";

export const openrouterProvider = createOpenAICompatibleProvider({
  name: "openrouter",
  displayName: "OpenRouter",
  defaultModel: "openai/gpt-4.1-mini",
  supportedModels: [
    "openai/gpt-4.1-mini",
    "anthropic/claude-sonnet-4.5",
    "google/gemini-2.5-flash",
  ],
  baseUrl: "https://openrouter.ai/api/v1",
  capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
});

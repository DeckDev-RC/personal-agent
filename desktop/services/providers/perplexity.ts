import { createOpenAICompatibleProvider } from "./openaiCompatible.js";

export const perplexityProvider = createOpenAICompatibleProvider({
  name: "perplexity",
  displayName: "Perplexity",
  defaultModel: "sonar",
  supportedModels: [
    "sonar",
    "sonar-pro",
    "sonar-reasoning",
  ],
  baseUrl: "https://api.perplexity.ai",
  capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
});

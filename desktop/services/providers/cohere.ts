import { createOpenAICompatibleProvider } from "./openaiCompatible.js";

export const cohereProvider = createOpenAICompatibleProvider({
  name: "cohere",
  displayName: "Cohere",
  defaultModel: "command-r-plus",
  supportedModels: [
    "command-r-plus",
    "command-r7b-12-2024",
  ],
  baseUrl: "https://api.cohere.com/compatibility/v1",
  capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
});

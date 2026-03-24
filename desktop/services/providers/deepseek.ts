import { createOpenAICompatibleProvider } from "./openaiCompatible.js";

export const deepseekProvider = createOpenAICompatibleProvider({
  name: "deepseek",
  displayName: "DeepSeek",
  defaultModel: "deepseek-chat",
  supportedModels: [
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  baseUrl: "https://api.deepseek.com",
  capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
});

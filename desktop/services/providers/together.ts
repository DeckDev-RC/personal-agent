import { createOpenAICompatibleProvider } from "./openaiCompatible.js";

export const togetherProvider = createOpenAICompatibleProvider({
  name: "together",
  displayName: "Together AI",
  defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
  supportedModels: [
    "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    "deepseek-ai/DeepSeek-V3",
  ],
  baseUrl: "https://api.together.xyz/v1",
  capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
});

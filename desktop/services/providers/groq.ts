import { createOpenAICompatibleProvider } from "./openaiCompatible.js";

export const groqProvider = createOpenAICompatibleProvider({
  name: "groq",
  displayName: "Groq",
  defaultModel: "llama-3.3-70b-versatile",
  supportedModels: [
    "llama-3.3-70b-versatile",
    "mixtral-8x7b-32768",
    "qwen/qwen3-32b",
  ],
  baseUrl: "https://api.groq.com/openai/v1",
  capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
});

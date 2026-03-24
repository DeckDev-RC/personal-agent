import type { Api } from "@mariozechner/pi-ai";
import type { CanonicalProviderName } from "../../../src/types/model.js";

export function getApiForProvider(provider: CanonicalProviderName): Api {
  switch (provider) {
    case "openai-codex":
      return "openai-codex-responses";
    case "anthropic":
      return "anthropic-messages";
    case "google-gemini":
      return "google-generative-ai";
    case "mistral":
      return "mistral-conversations";
    case "openai":
      return "openai-responses";
    default:
      return "openai-completions";
  }
}

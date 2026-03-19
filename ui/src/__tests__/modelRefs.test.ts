import { describe, expect, it } from "vitest";
import {
  getDefaultModelRef,
  getModelId,
  inferProviderFromModel,
  splitModelRef,
} from "../../../src/types/model.js";

describe("model refs", () => {
  it("normalizes bare models into canonical refs", () => {
    expect(splitModelRef("gpt-5.4").modelRef).toBe("openai-codex/gpt-5.4");
    expect(splitModelRef("claude-sonnet-4-6").modelRef).toBe("anthropic/claude-sonnet-4-6");
    expect(splitModelRef("llama3.3").modelRef).toBe("ollama/llama3.3");
  });

  it("respects provider hints and canonical refs", () => {
    expect(splitModelRef("gpt-5.4", "anthropic").modelRef).toBe("anthropic/gpt-5.4");
    expect(splitModelRef("openai-codex/gpt-5.4-mini").provider).toBe("openai-codex");
    expect(getModelId("openai-codex/gpt-5.4-mini")).toBe("gpt-5.4-mini");
  });

  it("keeps provider defaults explicit", () => {
    expect(getDefaultModelRef("openai-codex")).toBe("openai-codex/gpt-5.4");
    expect(inferProviderFromModel("claude-opus-4-6")).toBe("anthropic");
  });
});

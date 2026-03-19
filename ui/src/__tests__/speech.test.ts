import { describe, it, expect, vi } from "vitest";
import { isSpeechSupported, startRecognition, stopRecognition } from "../utils/speech";

describe("speech utility", () => {
  it("reports speech not supported when API is missing", () => {
    // In jsdom, SpeechRecognition is not available
    expect(isSpeechSupported()).toBe(false);
  });

  it("returns false when starting recognition without API", () => {
    const onResult = vi.fn();
    const onEnd = vi.fn();
    expect(startRecognition(onResult, onEnd)).toBe(false);
  });

  it("stopRecognition does not throw when not listening", () => {
    expect(() => stopRecognition()).not.toThrow();
  });
});

import type { Tool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { ToolMetadata } from "../../src/types/runtime.js";

export type BrowserToolName =
  | "browser_open"
  | "browser_snapshot"
  | "browser_click"
  | "browser_type"
  | "browser_wait"
  | "browser_screenshot"
  | "browser_extract_text"
  | "browser_close";

export type BrowserToolDefinition = Tool & {
  metadata: ToolMetadata;
};

export function buildBrowserTools(): BrowserToolDefinition[] {
  return [
    {
      name: "browser_open",
      description: "Open a URL in the persistent browser session.",
      metadata: {
        capabilities: ["networked", "requires_approval"],
        defaultTimeoutMs: 30_000,
      },
      parameters: Type.Object(
        {
          url: Type.String(),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_snapshot",
      description: "Capture a DOM and text snapshot of the active page.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 10_000,
      },
      parameters: Type.Object({}, { additionalProperties: false }),
    },
    {
      name: "browser_click",
      description: "Click an element on the active page.",
      metadata: {
        capabilities: ["mutating", "requires_approval"],
        defaultTimeoutMs: 15_000,
      },
      parameters: Type.Object(
        {
          selector: Type.String(),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_type",
      description: "Type text into an element on the active page.",
      metadata: {
        capabilities: ["mutating", "requires_approval"],
        defaultTimeoutMs: 15_000,
      },
      parameters: Type.Object(
        {
          selector: Type.String(),
          text: Type.String(),
          submit: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_wait",
      description: "Wait for time, selector, or text in the active page.",
      metadata: {
        capabilities: ["read_only", "long_running"],
        defaultTimeoutMs: 30_000,
      },
      parameters: Type.Object(
        {
          selector: Type.Optional(Type.String()),
          text: Type.Optional(Type.String()),
          timeMs: Type.Optional(Type.Number()),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_screenshot",
      description: "Capture a screenshot of the active page.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 15_000,
      },
      parameters: Type.Object(
        {
          fullPage: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_extract_text",
      description: "Extract visible text from the active page or a selector.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 10_000,
      },
      parameters: Type.Object(
        {
          selector: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_close",
      description: "Close the current browser session.",
      metadata: {
        capabilities: ["long_running"],
        defaultTimeoutMs: 10_000,
      },
      parameters: Type.Object({}, { additionalProperties: false }),
    },
  ];
}

import type { Tool } from "@mariozechner/pi-ai";
import { Type, type TProperties, type TSchema } from "@sinclair/typebox";
import type { ToolMetadata } from "../../src/types/runtime.js";

export type BrowserToolName =
  | "browser_tabs"
  | "browser_open"
  | "browser_snapshot"
  | "browser_console_messages"
  | "browser_page_errors"
  | "browser_network_requests"
  | "browser_click"
  | "browser_hover"
  | "browser_type"
  | "browser_drag"
  | "browser_select"
  | "browser_fill"
  | "browser_wait"
  | "browser_evaluate"
  | "browser_batch"
  | "browser_set_input_files"
  | "browser_handle_dialog"
  | "browser_screenshot"
  | "browser_extract_text"
  | "browser_close";

export type BrowserToolDefinition = Tool & {
  metadata: ToolMetadata;
};

function withOptionalConnectionId(
  properties: TProperties,
): TProperties {
  return {
    ...properties,
    connectionId: Type.Optional(Type.String()) as TSchema,
  };
}

function withContractContext(
  properties: TProperties,
): TProperties {
  return withOptionalConnectionId({
    ...properties,
    profile: Type.Optional(Type.String()) as TSchema,
    targetId: Type.Optional(Type.String()) as TSchema,
    selector: Type.Optional(Type.String()) as TSchema,
    ref: Type.Optional(Type.String()) as TSchema,
    frame: Type.Optional(Type.String()) as TSchema,
    timeoutMs: Type.Optional(Type.Number()) as TSchema,
  });
}

export function buildBrowserTools(): BrowserToolDefinition[] {
  const formFieldsSchema = Type.Union([
    Type.Array(
      Type.Object(
        {
          selector: Type.Optional(Type.String()) as TSchema,
          ref: Type.Optional(Type.String()) as TSchema,
          type: Type.Optional(Type.String()) as TSchema,
          value: Type.Optional(
            Type.Union([Type.String(), Type.Number(), Type.Boolean()]),
          ) as TSchema,
        },
        { additionalProperties: false },
      ),
    ),
    Type.String(),
  ]);
  const batchActionsSchema = Type.Union([
    Type.Array(Type.Object({}, { additionalProperties: true })),
    Type.String(),
  ]);
  const selectValuesSchema = Type.Union([
    Type.Array(Type.String()),
    Type.String(),
  ]);

  return [
    {
      name: "browser_tabs",
      description: "List open tabs in the persistent browser session.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 10_000,
      },
      parameters: Type.Object(
        withOptionalConnectionId({
          profile: Type.Optional(Type.String()) as TSchema,
        }),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_open",
      description: "Open a URL in the persistent browser session.",
      metadata: {
        capabilities: ["networked", "requires_approval"],
        defaultTimeoutMs: 30_000,
      },
      parameters: Type.Object(
        withContractContext({
          url: Type.String(),
        }),
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
      parameters: Type.Object(
        withContractContext({
          snapshotFormat: Type.Optional(
            Type.Union([
              Type.Literal("ai"),
              Type.Literal("aria"),
              Type.Literal("role"),
            ]),
          ),
          refs: Type.Optional(Type.Union([Type.Literal("role"), Type.Literal("aria")])),
          labels: Type.Optional(Type.Boolean()),
          limit: Type.Optional(Type.Number()),
          maxChars: Type.Optional(Type.Number()),
        }),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_console_messages",
      description: "Read collected console messages for the active tab/target.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 10_000,
      },
      parameters: Type.Object(
        withOptionalConnectionId({
          profile: Type.Optional(Type.String()) as TSchema,
          targetId: Type.Optional(Type.String()) as TSchema,
          minLevel: Type.Optional(
            Type.Union([
              Type.Literal("debug"),
              Type.Literal("info"),
              Type.Literal("log"),
              Type.Literal("warning"),
              Type.Literal("error"),
            ]),
          ),
          clear: Type.Optional(Type.Boolean()),
          limit: Type.Optional(Type.Number()),
        }),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_page_errors",
      description: "Read collected page errors for the active tab/target.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 10_000,
      },
      parameters: Type.Object(
        withOptionalConnectionId({
          profile: Type.Optional(Type.String()) as TSchema,
          targetId: Type.Optional(Type.String()) as TSchema,
          clear: Type.Optional(Type.Boolean()),
          limit: Type.Optional(Type.Number()),
        }),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_network_requests",
      description: "Read collected network requests for the active tab/target.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 10_000,
      },
      parameters: Type.Object(
        withOptionalConnectionId({
          profile: Type.Optional(Type.String()) as TSchema,
          targetId: Type.Optional(Type.String()) as TSchema,
          filter: Type.Optional(Type.String()),
          clear: Type.Optional(Type.Boolean()),
          limit: Type.Optional(Type.Number()),
        }),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_click",
      description: "Click an element on the active page.",
      metadata: {
        capabilities: ["mutating", "requires_approval"],
        defaultTimeoutMs: 15_000,
      },
      parameters: Type.Object(
        withContractContext({}),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_hover",
      description: "Hover an element on the active page.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 15_000,
      },
      parameters: Type.Object(
        withContractContext({}),
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
        withContractContext({
          text: Type.String(),
          submit: Type.Optional(Type.Boolean()),
        }),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_drag",
      description: "Drag from one element to another on the active page.",
      metadata: {
        capabilities: ["mutating", "requires_approval"],
        defaultTimeoutMs: 15_000,
      },
      parameters: Type.Object(
        withOptionalConnectionId({
          profile: Type.Optional(Type.String()) as TSchema,
          targetId: Type.Optional(Type.String()) as TSchema,
          frame: Type.Optional(Type.String()) as TSchema,
          timeoutMs: Type.Optional(Type.Number()) as TSchema,
          startSelector: Type.Optional(Type.String()) as TSchema,
          startRef: Type.Optional(Type.String()) as TSchema,
          endSelector: Type.Optional(Type.String()) as TSchema,
          endRef: Type.Optional(Type.String()) as TSchema,
        }),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_select",
      description: "Select one or more options in a dropdown element.",
      metadata: {
        capabilities: ["mutating", "requires_approval"],
        defaultTimeoutMs: 15_000,
      },
      parameters: Type.Object(
        withContractContext({
          values: selectValuesSchema as TSchema,
        }),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_fill",
      description: "Fill multiple fields on the active page in one action.",
      metadata: {
        capabilities: ["mutating", "requires_approval"],
        defaultTimeoutMs: 20_000,
      },
      parameters: Type.Object(
        withOptionalConnectionId({
          profile: Type.Optional(Type.String()) as TSchema,
          targetId: Type.Optional(Type.String()) as TSchema,
          frame: Type.Optional(Type.String()) as TSchema,
          timeoutMs: Type.Optional(Type.Number()) as TSchema,
          fields: formFieldsSchema as TSchema,
        }),
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
        withContractContext({
          text: Type.Optional(Type.String()),
          textGone: Type.Optional(Type.String()),
          timeMs: Type.Optional(Type.Number()),
          url: Type.Optional(Type.String()),
          loadState: Type.Optional(
            Type.Union([
              Type.Literal("load"),
              Type.Literal("domcontentloaded"),
              Type.Literal("networkidle"),
            ]),
          ),
        }),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_evaluate",
      description: "Run a JavaScript function on the active page or element.",
      metadata: {
        capabilities: ["mutating", "requires_approval"],
        defaultTimeoutMs: 20_000,
      },
      parameters: Type.Object(
        withContractContext({
          fn: Type.String(),
        }),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_batch",
      description: "Execute a batch of browser actions sequentially.",
      metadata: {
        capabilities: ["mutating", "requires_approval", "long_running"],
        defaultTimeoutMs: 30_000,
      },
      parameters: Type.Object(
        withOptionalConnectionId({
          profile: Type.Optional(Type.String()) as TSchema,
          targetId: Type.Optional(Type.String()) as TSchema,
          timeoutMs: Type.Optional(Type.Number()) as TSchema,
          stopOnError: Type.Optional(Type.Boolean()) as TSchema,
          actions: batchActionsSchema as TSchema,
        }),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_set_input_files",
      description: "Set files on a file input element in the active page.",
      metadata: {
        capabilities: ["mutating", "requires_approval"],
        defaultTimeoutMs: 20_000,
      },
      parameters: Type.Object(
        withContractContext({
          paths: selectValuesSchema as TSchema,
        }),
        { additionalProperties: false },
      ),
    },
    {
      name: "browser_handle_dialog",
      description: "Arm a one-shot dialog handler for the active page.",
      metadata: {
        capabilities: ["mutating", "requires_approval", "long_running"],
        defaultTimeoutMs: 20_000,
      },
      parameters: Type.Object(
        withOptionalConnectionId({
          profile: Type.Optional(Type.String()) as TSchema,
          targetId: Type.Optional(Type.String()) as TSchema,
          timeoutMs: Type.Optional(Type.Number()) as TSchema,
          accept: Type.Boolean(),
          promptText: Type.Optional(Type.String()) as TSchema,
        }),
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
        withContractContext({
          fullPage: Type.Optional(Type.Boolean()),
          labels: Type.Optional(Type.Boolean()),
          type: Type.Optional(Type.Union([Type.Literal("png"), Type.Literal("jpeg")])),
        }),
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
        withContractContext({}),
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
      parameters: Type.Object(
        withContractContext({}),
        { additionalProperties: false },
      ),
    },
  ];
}

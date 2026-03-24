import {
  normalizeBrowserActionRequest,
  normalizeBrowserSnapshotRequest,
  normalizeBrowserTabsRequest,
  resolveBrowserTargetId,
} from "../services/browserContract.js";

describe("browserContract", () => {
  it("defaults the target id when none is provided", () => {
    expect(resolveBrowserTargetId(undefined)).toBe("main");
  });

  it("normalizes snapshot requests into the shared browser contract", () => {
    expect(
      normalizeBrowserSnapshotRequest({
        profile: "erp",
        targetId: "tab-1",
        snapshotFormat: "aria",
        refs: "role",
        selector: "main form",
        frame: "iframe[name=app]",
        labels: true,
        limit: 25,
        maxChars: 4000,
      }),
    ).toEqual({
      connectionId: undefined,
      profile: "erp",
      targetId: "tab-1",
      selector: "main form",
      ref: undefined,
      frame: "iframe[name=app]",
      timeoutMs: undefined,
      snapshotFormat: "aria",
      refs: "role",
      labels: true,
      limit: 25,
      maxChars: 4000,
    });
  });

  it("normalizes action requests and preserves selector or ref context", () => {
    expect(
      normalizeBrowserActionRequest("click", {
        targetId: "tab-2",
        ref: "e17",
        frame: "iframe[name=content]",
        timeoutMs: 5000,
      }),
    ).toEqual({
      connectionId: undefined,
      profile: undefined,
      targetId: "tab-2",
      selector: undefined,
      ref: "e17",
      frame: "iframe[name=content]",
      timeoutMs: 5000,
      kind: "click",
      button: undefined,
      doubleClick: false,
      modifiers: undefined,
      delayMs: undefined,
    });
  });

  it("normalizes read-only hover requests into the shared browser contract", () => {
    expect(
      normalizeBrowserActionRequest("hover", {
        targetId: "tab-2",
        ref: "e17",
        frame: "iframe[name=content]",
        timeoutMs: 5000,
      }),
    ).toEqual({
      connectionId: undefined,
      profile: undefined,
      targetId: "tab-2",
      selector: undefined,
      ref: "e17",
      frame: "iframe[name=content]",
      timeoutMs: 5000,
      kind: "hover",
    });
  });

  it("normalizes tabs requests into the shared browser contract", () => {
    expect(
      normalizeBrowserTabsRequest({
        connectionId: "conn-1",
        profile: "erp",
      }),
    ).toEqual({
      connectionId: "conn-1",
      profile: "erp",
    });
  });

  it("normalizes browser activity observation requests", () => {
    expect(
      normalizeBrowserActionRequest("console_messages", {
        targetId: "tab-4",
        minLevel: "warning",
        clear: true,
        limit: 10,
      }),
    ).toEqual({
      connectionId: undefined,
      profile: undefined,
      targetId: "tab-4",
      selector: undefined,
      ref: undefined,
      frame: undefined,
      timeoutMs: undefined,
      kind: "console_messages",
      minLevel: "warning",
      clear: true,
      limit: 10,
    });
  });

  it("accepts role snapshots in the shared browser contract", () => {
    expect(
      normalizeBrowserSnapshotRequest({
        targetId: "tab-3",
        snapshotFormat: "role",
      }),
    ).toEqual({
      connectionId: undefined,
      profile: undefined,
      targetId: "tab-3",
      selector: undefined,
      ref: undefined,
      frame: undefined,
      timeoutMs: undefined,
      snapshotFormat: "role",
      refs: undefined,
      labels: undefined,
      limit: undefined,
      maxChars: undefined,
    });
  });

  it("normalizes browser_select values from a comma-separated string", () => {
    expect(
      normalizeBrowserActionRequest("select", {
        selector: "select[name=status]",
        values: "approved, active",
      }),
    ).toEqual({
      connectionId: undefined,
      profile: undefined,
      targetId: undefined,
      selector: "select[name=status]",
      ref: undefined,
      frame: undefined,
      timeoutMs: undefined,
      kind: "select",
      values: ["approved", "active"],
    });
  });

  it("normalizes browser_fill fields from a JSON string", () => {
    expect(
      normalizeBrowserActionRequest("fill", {
        fields:
          '[{"selector":"input[name=email]","value":"user@example.com"},{"ref":"e12","type":"checkbox","value":true}]',
      }),
    ).toEqual({
      connectionId: undefined,
      profile: undefined,
      targetId: undefined,
      selector: undefined,
      ref: undefined,
      frame: undefined,
      timeoutMs: undefined,
      kind: "fill",
      fields: [
        {
          selector: "input[name=email]",
          ref: undefined,
          type: undefined,
          value: "user@example.com",
        },
        {
          selector: undefined,
          ref: "e12",
          type: "checkbox",
          value: true,
        },
      ],
    });
  });

  it("normalizes browser_batch actions from JSON", () => {
    expect(
      normalizeBrowserActionRequest("batch", {
        targetId: "tab-8",
        stopOnError: false,
        actions:
          '[{"kind":"click","selector":"button.save"},{"kind":"wait","text":"Saved"},{"kind":"select","selector":"select[name=status]","values":["approved"]}]',
      }),
    ).toEqual({
      connectionId: undefined,
      profile: undefined,
      targetId: "tab-8",
      selector: undefined,
      ref: undefined,
      frame: undefined,
      timeoutMs: undefined,
      kind: "batch",
      stopOnError: false,
      actions: [
        {
          connectionId: undefined,
          profile: undefined,
          targetId: undefined,
          selector: "button.save",
          ref: undefined,
          frame: undefined,
          timeoutMs: undefined,
          kind: "click",
          button: undefined,
          doubleClick: false,
          modifiers: undefined,
          delayMs: undefined,
        },
        {
          connectionId: undefined,
          profile: undefined,
          targetId: undefined,
          selector: undefined,
          ref: undefined,
          frame: undefined,
          timeoutMs: undefined,
          kind: "wait",
          timeMs: undefined,
          text: "Saved",
          textGone: undefined,
          url: undefined,
          loadState: undefined,
        },
        {
          connectionId: undefined,
          profile: undefined,
          targetId: undefined,
          selector: "select[name=status]",
          ref: undefined,
          frame: undefined,
          timeoutMs: undefined,
          kind: "select",
          values: ["approved"],
        },
      ],
    });
  });

  it("normalizes browser_set_input_files paths from a comma-separated string", () => {
    expect(
      normalizeBrowserActionRequest("set_input_files", {
        selector: "input[type=file]",
        paths: "C:\\docs\\a.pdf, C:\\docs\\b.pdf",
      }),
    ).toEqual({
      connectionId: undefined,
      profile: undefined,
      targetId: undefined,
      selector: "input[type=file]",
      ref: undefined,
      frame: undefined,
      timeoutMs: undefined,
      kind: "set_input_files",
      paths: ["C:\\docs\\a.pdf", "C:\\docs\\b.pdf"],
    });
  });

  it("normalizes browser_handle_dialog requests", () => {
    expect(
      normalizeBrowserActionRequest("handle_dialog", {
        targetId: "tab-9",
        accept: true,
        promptText: "ok",
      }),
    ).toEqual({
      connectionId: undefined,
      profile: undefined,
      targetId: "tab-9",
      selector: undefined,
      ref: undefined,
      frame: undefined,
      timeoutMs: undefined,
      kind: "handle_dialog",
      accept: true,
      promptText: "ok",
    });
  });
});

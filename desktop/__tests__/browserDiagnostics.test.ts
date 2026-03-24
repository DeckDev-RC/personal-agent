import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildBrowserActivityArtifactHints,
  buildBrowserFailureResult,
} from "../services/browserDiagnostics.js";

describe("browserDiagnostics", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await fsp.rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("captures screenshot, dom, and visible text when a page is available", async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "codex-browser-diag-"));
    const page = {
      url: () => "https://erp.local/orders",
      content: vi.fn(async () => "<html><body><main>Orders</main></body></html>"),
      screenshot: vi.fn(async (options: { path: string }) => {
        await fsp.writeFile(options.path, "png-bytes");
      }),
      locator: vi.fn(() => ({
        innerText: vi.fn(async () => "Orders\nPending approval"),
      })),
    };

    const result = await buildBrowserFailureResult({
      error: new Error("Element not found"),
      toolName: "browser_click",
      page,
      targetId: "main",
      selector: "button.save",
      targetDir: tempDir,
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Browser action "browser_click" failed');
    expect(result.content).toContain("https://erp.local/orders");
    expect(result.content).toContain("button.save");

    const artifacts = Array.isArray(result.metadata?.browserArtifacts)
      ? (result.metadata?.browserArtifacts as Array<Record<string, unknown>>)
      : [];
    expect(artifacts).toHaveLength(3);
    expect(artifacts.some((artifact) => artifact.type === "dom_snapshot")).toBe(
      true,
    );
    expect(artifacts.some((artifact) => artifact.type === "browser_log")).toBe(
      true,
    );

    const screenshotArtifact = artifacts.find(
      (artifact) => artifact.type === "screenshot",
    );
    expect(typeof screenshotArtifact?.filePath).toBe("string");
    const stat = await fsp.stat(String(screenshotArtifact?.filePath));
    expect(stat.isFile()).toBe(true);
  });

  it("still returns a structured browser error without a page handle", async () => {
    const result = await buildBrowserFailureResult({
      error: "Blocked by allowed domains policy",
      toolName: "browser_open",
      targetId: "main",
      currentUrl: "https://blocked.example.com",
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Blocked by allowed domains policy");

    const artifacts = Array.isArray(result.metadata?.browserArtifacts)
      ? (result.metadata?.browserArtifacts as Array<Record<string, unknown>>)
      : [];
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.type).toBe("browser_log");
  });

  it("builds activity artifacts for console, page errors, and requests", () => {
    const artifacts = buildBrowserActivityArtifactHints({
      toolName: "browser_click",
      targetId: "billing",
      activity: {
        console: [
          {
            level: "info",
            text: "Loaded billing dashboard",
            timestamp: 1,
          },
        ],
        errors: [
          {
            message: "ReferenceError: total is not defined",
            timestamp: 2,
          },
        ],
        requests: [
          {
            id: "r1",
            url: "https://erp.local/api/billing",
            method: "GET",
            status: 200,
            ok: true,
            timestamp: 3,
          },
        ],
      },
    });

    expect(artifacts).toHaveLength(3);
    expect(artifacts[0]?.label).toContain("billing");
    expect(artifacts[0]?.contentText).toContain("Loaded billing dashboard");
    expect(artifacts[1]?.contentText).toContain("ReferenceError");
    expect(artifacts[2]?.contentText).toContain("https://erp.local/api/billing");
    expect(artifacts[2]?.contentText).toContain("200");
  });
});

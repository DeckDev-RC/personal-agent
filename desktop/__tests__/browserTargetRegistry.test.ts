import type { BrowserContext, Page } from "playwright-core";
import {
  createBrowserTargetRegistry,
  ensureBrowserTargetPage,
  getBrowserTargetIdForPage,
  listBrowserTargets,
  registerBrowserTarget,
  syncBrowserTargetsFromContext,
} from "../services/browserTargetRegistry.js";

function createFakePage(params?: {
  title?: string;
  url?: string;
  closed?: boolean;
}): Page {
  let closed = params?.closed ?? false;
  return {
    title: vi.fn(async () => params?.title ?? ""),
    url: vi.fn(() => params?.url ?? "about:blank"),
    isClosed: vi.fn(() => closed),
    __setClosed(nextClosed: boolean) {
      closed = nextClosed;
    },
  } as unknown as Page;
}

function createFakeContext(initialPages: Page[]): BrowserContext & {
  __pages: Page[];
  newPage: ReturnType<typeof vi.fn>;
} {
  const pages = [...initialPages];
  return {
    __pages: pages,
    pages: vi.fn(() => pages),
    newPage: vi.fn(async () => {
      const page = createFakePage({
        title: `Generated ${pages.length + 1}`,
        url: "about:blank",
      });
      pages.push(page);
      return page;
    }),
  } as unknown as BrowserContext & {
    __pages: Page[];
    newPage: ReturnType<typeof vi.fn>;
  };
}

describe("browserTargetRegistry", () => {
  it("resolves the main page when the default target is requested", async () => {
    const registry = createBrowserTargetRegistry();
    const mainPage = createFakePage({
      title: "Main",
      url: "https://example.com",
    });
    const context = createFakeContext([mainPage]);

    registerBrowserTarget({
      registry,
      page: mainPage,
      targetId: "main",
    });

    const resolved = await ensureBrowserTargetPage({
      registry,
      context,
      targetId: "main",
    });

    expect(resolved).toEqual({
      page: mainPage,
      targetId: "main",
      created: false,
    });
  });

  it("creates a new page when an explicit target does not exist yet", async () => {
    const registry = createBrowserTargetRegistry();
    const mainPage = createFakePage({
      title: "Main",
      url: "https://example.com",
    });
    const context = createFakeContext([mainPage]);

    registerBrowserTarget({
      registry,
      page: mainPage,
      targetId: "main",
    });

    const resolved = await ensureBrowserTargetPage({
      registry,
      context,
      targetId: "billing",
      createIfMissing: true,
    });

    expect(resolved?.targetId).toBe("billing");
    expect(resolved?.created).toBe(true);
    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(context.__pages).toHaveLength(2);
  });

  it("registers existing untracked pages from the browser context", () => {
    const registry = createBrowserTargetRegistry();
    const mainPage = createFakePage({
      title: "Main",
      url: "https://example.com",
    });
    const popupPage = createFakePage({
      title: "Popup",
      url: "https://example.com/popup",
    });
    const context = createFakeContext([mainPage, popupPage]);

    registerBrowserTarget({
      registry,
      page: mainPage,
      targetId: "main",
    });

    const registeredTargets = syncBrowserTargetsFromContext({
      registry,
      context,
    });

    expect(registeredTargets).toEqual(["tab-1"]);
    expect(getBrowserTargetIdForPage(registry, popupPage)).toBe("tab-1");
  });

  it("returns null when a target is missing and page creation is disabled", async () => {
    const registry = createBrowserTargetRegistry();
    const mainPage = createFakePage({
      title: "Main",
      url: "https://example.com",
    });
    const context = createFakeContext([mainPage]);

    registerBrowserTarget({
      registry,
      page: mainPage,
      targetId: "main",
    });

    await expect(
      ensureBrowserTargetPage({
        registry,
        context,
        targetId: "reports",
      }),
    ).resolves.toBeNull();
  });

  it("lists registered tabs with target ids, titles, and urls", async () => {
    const registry = createBrowserTargetRegistry();
    const mainPage = createFakePage({
      title: "Main",
      url: "https://example.com",
    });
    const popupPage = createFakePage({
      title: "Popup",
      url: "https://example.com/popup",
    });

    registerBrowserTarget({
      registry,
      page: mainPage,
      targetId: "main",
    });
    registerBrowserTarget({
      registry,
      page: popupPage,
      targetId: "tab-1",
    });

    await expect(listBrowserTargets(registry)).resolves.toEqual([
      {
        targetId: "main",
        title: "Main",
        url: "https://example.com",
      },
      {
        targetId: "tab-1",
        title: "Popup",
        url: "https://example.com/popup",
      },
    ]);
  });
});

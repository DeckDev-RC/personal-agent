import {
  collectVisibleBrowserLabelBoxes,
  takeBrowserLabeledScreenshot,
  type BrowserLabelLocatorLike,
  type BrowserLabelPageLike,
} from "../services/browserScreenshotLabels.js";

describe("browserScreenshotLabels", () => {
  it("collects only visible label boxes and counts skipped refs", async () => {
    const locators = new Map<string, BrowserLabelLocatorLike>([
      [
        "e1",
        {
          boundingBox: vi.fn(async () => ({
            x: 20,
            y: 25,
            width: 60,
            height: 30,
          })),
          screenshot: vi.fn(),
        },
      ],
      [
        "e2",
        {
          boundingBox: vi.fn(async () => ({
            x: 500,
            y: 500,
            width: 20,
            height: 20,
          })),
          screenshot: vi.fn(),
        },
      ],
      [
        "e3",
        {
          boundingBox: vi.fn(async () => null),
          screenshot: vi.fn(),
        },
      ],
      [
        "e4",
        {
          boundingBox: vi.fn(async () => ({
            x: 40,
            y: 50,
            width: 30,
            height: 20,
          })),
          screenshot: vi.fn(),
        },
      ],
    ]);

    const result = await collectVisibleBrowserLabelBoxes({
      refs: ["e1", "e2", "e3", "e4"],
      viewport: {
        scrollX: 10,
        scrollY: 15,
        width: 200,
        height: 120,
      },
      maxLabels: 2,
      resolveRef: (ref) => locators.get(ref)!,
    });

    expect(result).toEqual({
      boxes: [
        {
          ref: "e1",
          x: 10,
          y: 10,
          w: 60,
          h: 30,
        },
        {
          ref: "e4",
          x: 30,
          y: 35,
          w: 30,
          h: 20,
        },
      ],
      skipped: 2,
    });
  });

  it("applies and clears overlays around target screenshots", async () => {
    const target = {
      boundingBox: vi.fn(async () => ({
        x: 15,
        y: 25,
        width: 90,
        height: 40,
      })),
      screenshot: vi.fn(async () => undefined),
    } satisfies BrowserLabelLocatorLike;

    const page = {
      evaluate: vi
        .fn<BrowserLabelPageLike["evaluate"]>()
        .mockImplementation(async (_fn, arg?: unknown) => {
          if (arg === undefined) {
            return {
              scrollX: 0,
              scrollY: 0,
              width: 400,
              height: 300,
            };
          }
          return undefined as never;
        }),
      screenshot: vi.fn(async () => undefined),
    } satisfies BrowserLabelPageLike;

    const result = await takeBrowserLabeledScreenshot({
      page,
      target,
      outputPath: "capture.png",
      refs: ["e1"],
      resolveRef: () => target,
      type: "png",
      timeoutMs: 9_000,
    });

    expect(result).toEqual({
      labels: 1,
      skipped: 0,
    });
    expect(target.screenshot).toHaveBeenCalledWith({
      path: "capture.png",
      timeout: 9_000,
      type: "png",
    });
    expect(page.screenshot).not.toHaveBeenCalled();
    expect(page.evaluate).toHaveBeenCalledTimes(3);
    expect(page.evaluate.mock.calls[1]?.[1]).toMatchObject({
      labels: [
        {
          ref: "e1",
          x: 15,
          y: 25,
          w: 90,
          h: 40,
        },
      ],
      overlayAttr: "data-codex-browser-labels",
    });
    expect(page.evaluate.mock.calls[2]?.[1]).toBe("data-codex-browser-labels");
  });
});

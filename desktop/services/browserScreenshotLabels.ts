import type { Locator, Page } from "playwright-core";
import type { BrowserImageType } from "../../src/types/browser.js";

export type BrowserLabelViewport = {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
};

export type BrowserLabelBox = {
  ref: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type BrowserLabelLocatorLike = Pick<Locator, "boundingBox" | "screenshot">;

export type BrowserLabelPageLike = Pick<Page, "evaluate" | "screenshot">;

const DEFAULT_MAX_BROWSER_LABELS = 150;
const BROWSER_LABEL_OVERLAY_ATTR = "data-codex-browser-labels";

export async function collectVisibleBrowserLabelBoxes(params: {
  refs: string[];
  viewport: BrowserLabelViewport;
  resolveRef: (ref: string) => BrowserLabelLocatorLike;
  maxLabels?: number;
}): Promise<{ boxes: BrowserLabelBox[]; skipped: number }> {
  const maxLabels =
    typeof params.maxLabels === "number" && Number.isFinite(params.maxLabels)
      ? Math.max(1, Math.floor(params.maxLabels))
      : DEFAULT_MAX_BROWSER_LABELS;

  const boxes: BrowserLabelBox[] = [];
  let skipped = 0;

  for (const ref of params.refs) {
    if (boxes.length >= maxLabels) {
      skipped += 1;
      continue;
    }

    try {
      const box = await params.resolveRef(ref).boundingBox();
      if (!box) {
        skipped += 1;
        continue;
      }

      const x0 = box.x;
      const y0 = box.y;
      const x1 = box.x + box.width;
      const y1 = box.y + box.height;
      const vx0 = params.viewport.scrollX;
      const vy0 = params.viewport.scrollY;
      const vx1 = params.viewport.scrollX + params.viewport.width;
      const vy1 = params.viewport.scrollY + params.viewport.height;

      if (x1 < vx0 || x0 > vx1 || y1 < vy0 || y0 > vy1) {
        skipped += 1;
        continue;
      }

      boxes.push({
        ref,
        x: x0 - params.viewport.scrollX,
        y: y0 - params.viewport.scrollY,
        w: Math.max(1, box.width),
        h: Math.max(1, box.height),
      });
    } catch {
      skipped += 1;
    }
  }

  return { boxes, skipped };
}

export async function takeBrowserLabeledScreenshot(params: {
  page: BrowserLabelPageLike;
  target?: BrowserLabelLocatorLike | null;
  outputPath: string;
  refs: string[];
  resolveRef: (ref: string) => BrowserLabelLocatorLike;
  fullPage?: boolean;
  timeoutMs?: number;
  type?: BrowserImageType;
  maxLabels?: number;
}): Promise<{ labels: number; skipped: number }> {
  const viewport = await params.page.evaluate(() => ({
    scrollX: window.scrollX || 0,
    scrollY: window.scrollY || 0,
    width: window.innerWidth || 0,
    height: window.innerHeight || 0,
  }));

  const { boxes, skipped } = await collectVisibleBrowserLabelBoxes({
    refs: params.refs,
    viewport,
    resolveRef: params.resolveRef,
    maxLabels: params.maxLabels,
  });
  const overlayAttr = BROWSER_LABEL_OVERLAY_ATTR;

  try {
    if (boxes.length > 0) {
      await params.page.evaluate((input) => {
        const { labels, overlayAttr } = input as {
          labels: BrowserLabelBox[];
          overlayAttr: string;
        };
        const existing = document.querySelectorAll(`[${overlayAttr}]`);
        existing.forEach((element) => element.remove());

        const root = document.createElement("div");
        root.setAttribute(overlayAttr, "1");
        root.style.position = "fixed";
        root.style.left = "0";
        root.style.top = "0";
        root.style.zIndex = "2147483647";
        root.style.pointerEvents = "none";
        root.style.fontFamily =
          '"SF Mono","SFMono-Regular",Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace';

        const clamp = (value: number, min: number, max: number) =>
          Math.min(max, Math.max(min, value));

        for (const label of labels) {
          const box = document.createElement("div");
          box.setAttribute(overlayAttr, "1");
          box.style.position = "absolute";
          box.style.left = `${label.x}px`;
          box.style.top = `${label.y}px`;
          box.style.width = `${label.w}px`;
          box.style.height = `${label.h}px`;
          box.style.border = "2px solid #ffb020";
          box.style.boxSizing = "border-box";

          const tag = document.createElement("div");
          tag.setAttribute(overlayAttr, "1");
          tag.textContent = label.ref;
          tag.style.position = "absolute";
          tag.style.left = `${label.x}px`;
          tag.style.top = `${clamp(label.y - 18, 0, 20_000)}px`;
          tag.style.background = "#ffb020";
          tag.style.color = "#1a1a1a";
          tag.style.fontSize = "12px";
          tag.style.lineHeight = "14px";
          tag.style.padding = "1px 4px";
          tag.style.borderRadius = "3px";
          tag.style.boxShadow = "0 1px 2px rgba(0,0,0,0.35)";
          tag.style.whiteSpace = "nowrap";

          root.appendChild(box);
          root.appendChild(tag);
        }

        document.documentElement.appendChild(root);
      }, { labels: boxes, overlayAttr });
    }

    if (params.target) {
      await params.target.screenshot({
        path: params.outputPath,
        timeout: params.timeoutMs,
        type: params.type,
      });
    } else {
      await params.page.screenshot({
        path: params.outputPath,
        fullPage: params.fullPage === true,
        timeout: params.timeoutMs,
        type: params.type,
      });
    }

    return {
      labels: boxes.length,
      skipped,
    };
  } finally {
    await params.page
      .evaluate((attr) => {
        const existing = document.querySelectorAll(`[${String(attr)}]`);
        existing.forEach((element) => element.remove());
      }, overlayAttr)
      .catch(() => undefined);
  }
}

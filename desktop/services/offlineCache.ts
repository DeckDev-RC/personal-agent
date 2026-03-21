import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataRoot } from "./dataRoot.js";

const CACHE_DIR = "offline-cache";

function cacheDir(): string {
  return path.join(resolveDataRoot(), CACHE_DIR);
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(cacheDir(), { recursive: true });
}

export async function getCachedItem<T>(key: string): Promise<T | null> {
  try {
    const filePath = path.join(cacheDir(), `${sanitizeKey(key)}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
      await fs.unlink(filePath).catch(() => {});
      return null;
    }
    return parsed.data as T;
  } catch {
    return null;
  }
}

export async function setCachedItem<T>(key: string, data: T, ttlMs = 24 * 60 * 60 * 1000): Promise<void> {
  await ensureCacheDir();
  const filePath = path.join(cacheDir(), `${sanitizeKey(key)}.json`);
  await fs.writeFile(filePath, JSON.stringify({
    key,
    data,
    cachedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  }), "utf8");
}

export async function deleteCachedItem(key: string): Promise<void> {
  try {
    await fs.unlink(path.join(cacheDir(), `${sanitizeKey(key)}.json`));
  } catch {}
}

export async function clearCache(): Promise<void> {
  try {
    const dir = cacheDir();
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (file.endsWith(".json")) {
        await fs.unlink(path.join(dir, file)).catch(() => {});
      }
    }
  } catch {}
}

export async function getCacheStats(): Promise<{ itemCount: number; totalSizeBytes: number }> {
  try {
    const dir = cacheDir();
    const files = await fs.readdir(dir);
    let totalSize = 0;
    let count = 0;
    for (const file of files) {
      if (file.endsWith(".json")) {
        const stat = await fs.stat(path.join(dir, file));
        totalSize += stat.size;
        count++;
      }
    }
    return { itemCount: count, totalSizeBytes: totalSize };
  } catch {
    return { itemCount: 0, totalSizeBytes: 0 };
  }
}

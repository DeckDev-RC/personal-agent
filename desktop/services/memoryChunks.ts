import { createHash } from "node:crypto";

const MEMORY_CHUNK_SIZE = 1200;

export function chunkMemoryContent(content: string): string[] {
  if (content.length <= MEMORY_CHUNK_SIZE) {
    return [content];
  }

  const chunks: string[] = [];
  for (let offset = 0; offset < content.length; offset += MEMORY_CHUNK_SIZE) {
    chunks.push(content.slice(offset, offset + MEMORY_CHUNK_SIZE));
  }
  return chunks;
}

export function estimateTokenCount(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

export function hashMemoryContent(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

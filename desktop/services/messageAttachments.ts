import fs from "node:fs/promises";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { SessionMessageRecord } from "../../src/types/runtime.js";
import { getArtifactRecord } from "./v2SessionStore.js";

type AttachmentRef = {
  artifactId: string;
  mimeType: string;
};

function getMessageAttachmentRefs(message: SessionMessageRecord): AttachmentRef[] {
  const rawAttachments = message.metadata?.attachments;
  if (!Array.isArray(rawAttachments)) {
    return [];
  }

  return rawAttachments
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const artifactId = typeof (item as { artifactId?: unknown }).artifactId === "string"
        ? String((item as { artifactId: string }).artifactId).trim()
        : "";
      const mimeType = typeof (item as { mimeType?: unknown }).mimeType === "string"
        ? String((item as { mimeType: string }).mimeType).trim()
        : "";
      if (!artifactId || !mimeType.startsWith("image/")) {
        return null;
      }
      return { artifactId, mimeType };
    })
    .filter((item): item is AttachmentRef => Boolean(item));
}

export async function loadImagePartsForMessage(message: SessionMessageRecord, limit = 4): Promise<ImageContent[]> {
  const attachments = getMessageAttachmentRefs(message).slice(0, limit);
  const parts: ImageContent[] = [];

  for (const attachment of attachments) {
    const artifact = await getArtifactRecord(attachment.artifactId);
    if (!artifact?.filePath) {
      continue;
    }

    try {
      const buffer = await fs.readFile(artifact.filePath);
      if (buffer.byteLength > 5_000_000) {
        continue;
      }
      parts.push({
        type: "image",
        data: buffer.toString("base64"),
        mimeType: attachment.mimeType,
      });
    } catch {
      // Best-effort attachment loading.
    }
  }

  return parts;
}

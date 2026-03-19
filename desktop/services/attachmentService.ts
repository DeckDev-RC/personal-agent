import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { AttachmentRecord } from "../../src/types/runtime.js";
import { attachmentsDir } from "./v2Paths.js";
import { ensureDir } from "./v2Fs.js";
import { saveArtifactRecord, saveMemorySourceContent } from "./v2SessionStore.js";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 180) || "attachment";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();
    if (pageText) {
      pages.push(pageText);
    }
  }
  return pages.join("\n\n");
}

async function extractAttachmentText(params: {
  mimeType: string;
  buffer: Buffer;
}): Promise<string | undefined> {
  if (params.mimeType.startsWith("text/")) {
    return params.buffer.toString("utf8");
  }

  if (params.mimeType === "application/pdf") {
    const text = await extractPdfText(params.buffer);
    return text.trim() || undefined;
  }

  return undefined;
}

export async function saveAttachment(params: {
  sessionId: string;
  fileName: string;
  mimeType: string;
  bytesBase64: string;
}): Promise<AttachmentRecord> {
  const buffer = Buffer.from(params.bytesBase64, "base64");
  await ensureDir(attachmentsDir(params.sessionId));
  const artifactId = randomUUID();
  const safeName = sanitizeFileName(params.fileName);
  const filePath = path.join(attachmentsDir(params.sessionId), `${artifactId}-${safeName}`);
  await fs.writeFile(filePath, buffer);

  const extractedText = await extractAttachmentText({
    mimeType: params.mimeType,
    buffer,
  });

  await saveArtifactRecord({
    artifactId,
    sessionId: params.sessionId,
    runId: "attachment",
    type: "attachment",
    label: params.fileName,
    filePath,
    metadata: {
      fileName: params.fileName,
      mimeType: params.mimeType,
      byteSize: buffer.byteLength,
      extractedTextAvailable: Boolean(extractedText?.trim()),
    },
  });

  if (extractedText?.trim()) {
    await saveArtifactRecord({
      artifactId: randomUUID(),
      sessionId: params.sessionId,
      runId: "attachment",
      type: "preview",
      label: `${params.fileName} preview`,
      contentText: extractedText.slice(0, 12000),
      metadata: {
        attachmentArtifactId: artifactId,
        fileName: params.fileName,
      },
    });
  }

  if (extractedText?.trim()) {
    await saveMemorySourceContent({
      sourceId: `attachment:${artifactId}`,
      sourceType: "attachment_text",
      sessionId: params.sessionId,
      runId: "attachment",
      title: params.fileName,
      path: filePath,
      content: extractedText,
    });
  }

  return {
    artifactId,
    sessionId: params.sessionId,
    fileName: params.fileName,
    mimeType: params.mimeType,
    byteSize: buffer.byteLength,
    extractedTextAvailable: Boolean(extractedText?.trim()),
  };
}

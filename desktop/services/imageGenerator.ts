import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AttachmentRecord } from "../../src/types/runtime.js";
import { resolveProviderCredential } from "./providerAuthStore.js";
import { ensureDir } from "./v2Fs.js";
import { artifactsDir } from "./v2Paths.js";
import { saveRunArtifactRecord } from "./v2SessionStore.js";

export type GeneratedImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";
export type GeneratedImageQuality = "low" | "medium" | "high" | "auto";
export type GeneratedImageBackground = "transparent" | "opaque" | "auto";
export type GeneratedImageFormat = "png" | "webp" | "jpeg";

export type GenerateImageParams = {
  sessionId: string;
  runId: string;
  prompt: string;
  model?: string;
  size?: GeneratedImageSize;
  quality?: GeneratedImageQuality;
  background?: GeneratedImageBackground;
  outputFormat?: GeneratedImageFormat;
  count?: number;
  signal?: AbortSignal;
};

export type GeneratedImageResult = {
  attachments: AttachmentRecord[];
  revisedPrompts: string[];
  model: string;
  size: GeneratedImageSize;
  quality: GeneratedImageQuality;
  background: GeneratedImageBackground;
  outputFormat: GeneratedImageFormat;
  usage?: Record<string, unknown>;
};

type OpenAIImagesResponse = {
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
    url?: string;
  }>;
  usage?: Record<string, unknown>;
};

const DEFAULT_MODEL = "gpt-image-1.5";
const DEFAULT_SIZE: GeneratedImageSize = "1024x1024";
const DEFAULT_QUALITY: GeneratedImageQuality = "medium";
const DEFAULT_BACKGROUND: GeneratedImageBackground = "auto";
const DEFAULT_OUTPUT_FORMAT: GeneratedImageFormat = "png";

function joinApiPath(baseUrl: string, pathname: string): string {
  return new URL(pathname.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function outputFormatToMimeType(outputFormat: GeneratedImageFormat): string {
  switch (outputFormat) {
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

function outputFormatToExtension(outputFormat: GeneratedImageFormat): string {
  return outputFormat === "jpeg" ? "jpg" : outputFormat;
}

async function readImageBuffer(image: { b64_json?: string; url?: string }, signal?: AbortSignal): Promise<Buffer> {
  if (image.b64_json) {
    return Buffer.from(image.b64_json, "base64");
  }

  if (!image.url) {
    throw new Error("Image generation response did not include image data.");
  }

  const response = await fetch(image.url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to download generated image (${response.status} ${response.statusText}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function parseOpenAIError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

export async function generateImages(params: GenerateImageParams): Promise<GeneratedImageResult> {
  const prompt = params.prompt.trim();
  if (!prompt) {
    throw new Error("Image prompt is required.");
  }

  const model = params.model?.trim() || DEFAULT_MODEL;
  const size = params.size ?? DEFAULT_SIZE;
  const quality = params.quality ?? DEFAULT_QUALITY;
  const background = params.background ?? DEFAULT_BACKGROUND;
  const outputFormat = params.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
  const count = Math.max(1, Math.min(4, params.count ?? 1));

  const credential = await resolveProviderCredential("openai");
  if (!credential.apiKey) {
    throw new Error("OpenAI API key is required to generate images.");
  }

  const requestBody: Record<string, unknown> = {
    model,
    prompt,
    size,
    quality,
    background,
    output_format: outputFormat,
    n: count,
  };

  if (model.startsWith("dall-e-")) {
    requestBody.response_format = "b64_json";
  }

  const response = await fetch(
    joinApiPath(credential.baseUrl ?? "https://api.openai.com/v1", "images/generations"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: params.signal,
    },
  );

  const payload = (await response.json().catch(() => ({}))) as OpenAIImagesResponse;
  if (!response.ok) {
    throw new Error(parseOpenAIError(payload) ?? `Image generation failed (${response.status} ${response.statusText}).`);
  }

  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("Image generation returned no images.");
  }

  const mimeType = outputFormatToMimeType(outputFormat);
  const extension = outputFormatToExtension(outputFormat);
  const runArtifactsDir = artifactsDir(params.sessionId, params.runId);
  await ensureDir(runArtifactsDir);

  const attachments: AttachmentRecord[] = [];
  const revisedPrompts: string[] = [];

  for (let index = 0; index < payload.data.length; index += 1) {
    const item = payload.data[index];
    const buffer = await readImageBuffer(item, params.signal);
    const artifactId = randomUUID();
    const fileName = `generated-image-${index + 1}.${extension}`;
    const absolutePath = path.join(runArtifactsDir, `${artifactId}-${fileName}`);
    await fs.writeFile(absolutePath, buffer);

    await saveRunArtifactRecord({
      sessionId: params.sessionId,
      runId: params.runId,
      artifact: {
        artifactId,
        type: "attachment",
        label: fileName,
        filePath: absolutePath,
        metadata: {
          fileName,
          mimeType,
          byteSize: buffer.byteLength,
          extractedTextAvailable: false,
          generated: true,
          prompt,
          revisedPrompt: item.revised_prompt,
          model,
          size,
          quality,
          background,
          outputFormat,
        },
      },
    });

    attachments.push({
      artifactId,
      sessionId: params.sessionId,
      fileName,
      mimeType,
      byteSize: buffer.byteLength,
      extractedTextAvailable: false,
    });

    if (item.revised_prompt?.trim()) {
      revisedPrompts.push(item.revised_prompt.trim());
    }
  }

  return {
    attachments,
    revisedPrompts,
    model,
    size,
    quality,
    background,
    outputFormat,
    usage: payload.usage,
  };
}

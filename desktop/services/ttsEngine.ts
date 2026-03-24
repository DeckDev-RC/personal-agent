import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AttachmentRecord } from "../../src/types/runtime.js";
import { resolveProviderCredential } from "./providerAuthStore.js";
import { ensureDir } from "./v2Fs.js";
import { artifactsDir } from "./v2Paths.js";
import { saveArtifactRecord } from "./v2SessionStore.js";

export type TextToSpeechProvider = "openai";
export type TextToSpeechFormat = "mp3" | "wav";

export type SynthesizeSpeechParams = {
  sessionId: string;
  runId: string;
  text: string;
  provider?: TextToSpeechProvider;
  model?: string;
  voice?: string;
  language?: string;
  instructions?: string;
  format?: TextToSpeechFormat;
  speed?: number;
  signal?: AbortSignal;
};

export type SynthesizedSpeechResult = {
  attachments: AttachmentRecord[];
  provider: TextToSpeechProvider;
  model: string;
  voice: string;
  format: TextToSpeechFormat;
  language?: string;
  instructions?: string;
  speed?: number;
};

type OpenAIErrorPayload = {
  error?: {
    message?: string;
  };
};

const DEFAULT_PROVIDER: TextToSpeechProvider = "openai";
const DEFAULT_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "alloy";
const DEFAULT_FORMAT: TextToSpeechFormat = "mp3";

function joinApiPath(baseUrl: string, pathname: string): string {
  return new URL(pathname.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function formatToMimeType(format: TextToSpeechFormat): string {
  return format === "wav" ? "audio/wav" : "audio/mpeg";
}

function formatToExtension(format: TextToSpeechFormat): string {
  return format === "wav" ? "wav" : "mp3";
}

function parseOpenAIError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const error = (payload as OpenAIErrorPayload).error;
  return typeof error?.message === "string" ? error.message : undefined;
}

function buildOpenAIInstructions(params: {
  language?: string;
  instructions?: string;
}): string | undefined {
  const parts = [
    params.language?.trim() ? `Speak in ${params.language.trim()}.` : "",
    params.instructions?.trim() ?? "",
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : undefined;
}

function normalizeSpeed(speed?: number): number | undefined {
  if (typeof speed !== "number" || !Number.isFinite(speed)) {
    return undefined;
  }

  return Math.min(4, Math.max(0.25, speed));
}

async function synthesizeOpenAISpeech(params: SynthesizeSpeechParams): Promise<{
  provider: TextToSpeechProvider;
  model: string;
  voice: string;
  format: TextToSpeechFormat;
  mimeType: string;
  extension: string;
  instructions?: string;
  speed?: number;
  buffer: Buffer;
}> {
  const credential = await resolveProviderCredential("openai");
  if (!credential.apiKey) {
    throw new Error("OpenAI API key is required to generate speech.");
  }

  const model = params.model?.trim() || DEFAULT_MODEL;
  const voice = params.voice?.trim() || DEFAULT_VOICE;
  const format = params.format ?? DEFAULT_FORMAT;
  const instructions = buildOpenAIInstructions({
    language: params.language,
    instructions: params.instructions,
  });
  const speed = normalizeSpeed(params.speed);

  const response = await fetch(
    joinApiPath(credential.baseUrl ?? "https://api.openai.com/v1", "audio/speech"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: params.text,
        voice,
        response_format: format,
        ...(instructions ? { instructions } : {}),
        ...(speed ? { speed } : {}),
      }),
      signal: params.signal,
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as OpenAIErrorPayload;
    throw new Error(parseOpenAIError(payload) ?? `Speech synthesis failed (${response.status} ${response.statusText}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error("Speech synthesis returned empty audio.");
  }

  return {
    provider: "openai",
    model,
    voice,
    format,
    mimeType: formatToMimeType(format),
    extension: formatToExtension(format),
    instructions,
    speed,
    buffer,
  };
}

export async function synthesizeSpeech(params: SynthesizeSpeechParams): Promise<SynthesizedSpeechResult> {
  const text = params.text.trim();
  if (!text) {
    throw new Error("Speech text is required.");
  }

  const provider = params.provider ?? DEFAULT_PROVIDER;
  const generated =
    provider === "openai"
      ? await synthesizeOpenAISpeech({
          ...params,
          text,
          provider,
        })
      : null;

  if (!generated) {
    throw new Error(`Unsupported text-to-speech provider: ${provider}`);
  }

  const runArtifactsDir = artifactsDir(params.sessionId, params.runId);
  await ensureDir(runArtifactsDir);

  const artifactId = randomUUID();
  const fileName = `generated-speech.${generated.extension}`;
  const absolutePath = path.join(runArtifactsDir, `${artifactId}-${fileName}`);
  await fs.writeFile(absolutePath, generated.buffer);

  await saveArtifactRecord({
    artifactId,
    sessionId: params.sessionId,
    runId: params.runId,
    type: "attachment",
    label: fileName,
    filePath: absolutePath,
    metadata: {
      fileName,
      mimeType: generated.mimeType,
      byteSize: generated.buffer.byteLength,
      extractedTextAvailable: false,
      generated: true,
      provider: generated.provider,
      model: generated.model,
      voice: generated.voice,
      format: generated.format,
      language: params.language?.trim() || undefined,
      instructions: generated.instructions,
      speed: generated.speed,
      sourceTextPreview: text.slice(0, 500),
    },
  });

  const attachment: AttachmentRecord = {
    artifactId,
    sessionId: params.sessionId,
    fileName,
    mimeType: generated.mimeType,
    byteSize: generated.buffer.byteLength,
    extractedTextAvailable: false,
  };

  return {
    attachments: [attachment],
    provider: generated.provider,
    model: generated.model,
    voice: generated.voice,
    format: generated.format,
    language: params.language?.trim() || undefined,
    instructions: generated.instructions,
    speed: generated.speed,
  };
}

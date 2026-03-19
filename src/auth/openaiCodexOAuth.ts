import childProcess from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";

import {
  getOAuthApiKey,
  getOAuthProviders,
  loginOpenAICodex,
  type OAuthCredentials,
} from "@mariozechner/pi-ai/oauth";
import { resolveDataRoot } from "../../desktop/services/dataRoot.js";

const OPENAI_AUTH_PROBE_URL =
  "https://auth.openai.com/oauth/authorize?response_type=code&client_id=openclaw-preflight&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&scope=openid+profile+email";

export type StoredCodexCreds = {
  provider: "openai-codex";
  email?: string;
  creds: OAuthCredentials;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inferEmailFromCreds(creds: OAuthCredentials): string | undefined {
  const accessToken = (creds as { access?: unknown }).access;
  if (typeof accessToken !== "string") return undefined;
  const payload = decodeJwtPayload(accessToken);
  const profile = payload?.["https://api.openai.com/profile"] as { email?: unknown } | undefined;
  return typeof profile?.email === "string" ? profile.email : undefined;
}

export function resolveCodexCredsPath(): string {
  const override = process.env.CODEX_OAUTH_STORE_PATH?.trim();
  if (override) return override;
  return path.join(resolveDataRoot(), "auth", "openai-codex.json");
}

function legacyCodexCredsPath(): string {
  return path.join(process.cwd(), "data", "openai-codex-oauth.json");
}

async function ensureDirForFile(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function openUrlInBrowser(url: string): void {
  childProcess.exec(`cmd /c start "" "${url}"`, { windowsHide: true }, () => {
    // Best-effort only.
  });
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    return String(answer ?? "").trim();
  } finally {
    rl.close();
  }
}

export type OpenAICodexOAuthUIHandlers = {
  openUrl?: (url: string) => void | Promise<void>;
  promptForRedirect?: (prompt: { message: string; placeholder?: string }) => Promise<string>;
  onProgress?: (msg: string) => void;
};

async function runPreflight(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(OPENAI_AUTH_PROBE_URL, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `\n[OAuth preflight] Aviso: falha de conectividade/TLS: ${message}\n` +
        "Se der erro no login, verifique proxy, DNS, firewall e tente novamente.\n\n",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function loginAndStoreOpenAICodexOAuth(params?: {
  verbose?: boolean;
  ui?: OpenAICodexOAuthUIHandlers;
}): Promise<StoredCodexCreds> {
  const verbose = params?.verbose ?? true;
  const ui = params?.ui;
  await runPreflight();

  if (verbose) {
    process.stdout.write(
      "Abrindo o navegador para autenticacao OpenAI Codex.\n" +
        "Se nao terminar sozinho, vou pedir para voce colar o redirect URL.\n",
    );
  }

  const openUrl = ui?.openUrl ?? ((url: string) => openUrlInBrowser(url));
  const promptForRedirect =
    ui?.promptForRedirect ??
    (async (prompt: { message: string; placeholder?: string }) => {
      if (verbose) {
        process.stdout.write(`${prompt.message}\n`);
      }
      const answer = await promptLine("Redirect URL / code: ");
      if (!answer) throw new Error("Entrada vazia. Tente novamente.");
      return answer;
    });

  const creds = await loginOpenAICodex({
    onAuth: async ({ url }: { url: string }) => {
      if (verbose) {
        process.stdout.write(`\nAbrir URL de OAuth: ${url}\n\n`);
      }
      await openUrl(url);
    },
    onPrompt: async (prompt: { message: string; placeholder?: string }) => {
      const value = await promptForRedirect(prompt);
      if (!value) throw new Error("Entrada vazia. Tente novamente.");
      return value;
    },
    onProgress: (message: string) => {
      ui?.onProgress?.(message);
      if (!verbose) return;
      process.stdout.write(`\r${message}`);
    },
  });

  if (!creds) {
    throw new Error("OAuth login falhou (sem credentials retornadas).");
  }

  const stored: StoredCodexCreds = {
    provider: "openai-codex",
    email:
      typeof (creds as { email?: unknown }).email === "string"
        ? ((creds as { email?: string }).email as string)
        : inferEmailFromCreds(creds),
    creds,
  };

  const storePath = resolveCodexCredsPath();
  await ensureDirForFile(storePath);
  await fs.writeFile(storePath, JSON.stringify(stored, null, 2), "utf8");

  if (verbose) {
    process.stdout.write("\nLogin concluido e credenciais salvas.\n");
  }

  return stored;
}

export async function loadStoredOpenAICodexCreds(): Promise<StoredCodexCreds> {
  let raw: string;
  try {
    raw = await fs.readFile(resolveCodexCredsPath(), "utf8");
  } catch {
    raw = await fs.readFile(legacyCodexCredsPath(), "utf8");
    await ensureDirForFile(resolveCodexCredsPath());
    await fs.writeFile(resolveCodexCredsPath(), raw, "utf8");
  }
  const parsed = JSON.parse(raw) as StoredCodexCreds;
  if (!parsed?.creds) {
    throw new Error("Arquivo de credenciais invalido (sem creds).");
  }
  if (parsed.provider !== "openai-codex") {
    throw new Error(`provider inesperado: ${parsed.provider}`);
  }
  if (!parsed.email) {
    parsed.email = inferEmailFromCreds(parsed.creds);
  }
  return parsed;
}

export async function deleteStoredOpenAICodexCreds(): Promise<void> {
  await fs.rm(resolveCodexCredsPath(), { force: true });
}

export async function resolveOpenAICodexAccessToken(params: {
  creds: OAuthCredentials;
}): Promise<string> {
  const providers = getOAuthProviders();
  const codexProvider = providers.find((provider) => provider.id === "openai-codex");
  const providerId = codexProvider?.id ?? "openai-codex";
  if (!codexProvider) {
    throw new Error('Provider "openai-codex" nao encontrado em getOAuthProviders().');
  }

  const oauthCreds: Record<string, OAuthCredentials> = {
    [providerId]: params.creds,
  };

  const result = await getOAuthApiKey(providerId, oauthCreds);
  if (!result?.apiKey) {
    throw new Error("Falha ao resolver access token para OpenAI Codex.");
  }

  if (result.newCredentials && typeof result.newCredentials === "object") {
    try {
      const current = await loadStoredOpenAICodexCreds();
      current.creds = result.newCredentials;
      current.email = current.email ?? inferEmailFromCreds(result.newCredentials);
      await fs.writeFile(resolveCodexCredsPath(), JSON.stringify(current, null, 2), "utf8");
    } catch {
      // Best-effort only.
    }
  }

  return result.apiKey;
}

export async function waitForStability(ms: number): Promise<void> {
  await sleep(ms);
}

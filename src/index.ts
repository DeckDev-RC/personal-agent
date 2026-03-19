import { loginAndStoreOpenAICodexOAuth } from "./auth/openaiCodexOAuth.js";
import { runSingleTurnText } from "../desktop/services/runtimeCore.js";

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function usage(): string {
  return [
    "Uso:",
    "  npm run login",
    "  npm run chat -- --model gpt-5.4 \"sua mensagem\"",
    "",
    "Env vars opcionais:",
    "  CODEX_OAUTH_STORE_PATH=... (caminho do JSON com credenciais OAuth)",
  ].join("\n");
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v.startsWith("--") && i + 1 < argv.length) {
      out[v.slice(2)] = argv[i + 1];
      i++;
      continue;
    }
  }
  return out;
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) {
    process.stdout.write(usage());
    process.exit(1);
  }

  if (command === "login") {
    await loginAndStoreOpenAICodexOAuth({ verbose: true });
    return;
  }

  if (command === "chat") {
    const args = parseArgs(rest);
    const model = (args.model ?? "gpt-5.4").trim();

    // Message may come as the last positional argument (after flags),
    // or we ask interactively if missing.
    const positional = rest.filter((t) => !t.startsWith("--"));
    // Example argv: ["--model","gpt-5.4","mensagem aqui"]
    const message = positional.length >= 1 ? positional[positional.length - 1] : "";

    const finalMessage = message || (await promptLine("Sua mensagem: "));
    if (!finalMessage) throw new Error("Mensagem vazia.");

    const result = await runSingleTurnText({
      modelRef: model.includes("/") ? model : `openai-codex/${model}`,
      systemPrompt: "You are a helpful AI assistant.",
      input: finalMessage,
    });

    process.stdout.write(`\n${result.text}\n`);
    return;
  }

  process.stdout.write(`Comando desconhecido: ${command}\n\n${usage()}`);
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`\nErro: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});


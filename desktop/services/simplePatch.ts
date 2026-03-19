import fs from "node:fs/promises";
import path from "node:path";

type PatchOperation =
  | { type: "add"; filePath: string; content: string }
  | { type: "delete"; filePath: string }
  | { type: "update"; filePath: string; oldText: string; newText: string };

function normalizeLines(input: string): string[] {
  return input.replace(/\r\n/g, "\n").split("\n");
}

export function parseSimplePatch(input: string): PatchOperation[] {
  const lines = normalizeLines(input);
  const ops: PatchOperation[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (line === "*** Begin Patch" || line === "*** End Patch") {
      index += 1;
      continue;
    }

    if (line.startsWith("*** Add File: ")) {
      const filePath = line.slice("*** Add File: ".length).trim();
      index += 1;
      const content: string[] = [];
      while (index < lines.length && !lines[index].startsWith("*** ")) {
        const current = lines[index];
        content.push(current.startsWith("+") ? current.slice(1) : current);
        index += 1;
      }
      ops.push({ type: "add", filePath, content: content.join("\n") });
      continue;
    }

    if (line.startsWith("*** Delete File: ")) {
      const filePath = line.slice("*** Delete File: ".length).trim();
      ops.push({ type: "delete", filePath });
      index += 1;
      continue;
    }

    if (line.startsWith("*** Update File: ")) {
      const filePath = line.slice("*** Update File: ".length).trim();
      index += 1;
      const oldLines: string[] = [];
      const newLines: string[] = [];
      while (index < lines.length && !lines[index].startsWith("*** Update File: ") && !lines[index].startsWith("*** Add File: ") && !lines[index].startsWith("*** Delete File: ") && lines[index] !== "*** End Patch") {
        const current = lines[index];
        if (current.startsWith("@@")) {
          index += 1;
          continue;
        }
        if (current.startsWith("-")) {
          oldLines.push(current.slice(1));
        } else if (current.startsWith("+")) {
          newLines.push(current.slice(1));
        } else if (current.startsWith(" ")) {
          oldLines.push(current.slice(1));
          newLines.push(current.slice(1));
        } else if (current === "*** End of File") {
          index += 1;
          break;
        }
        index += 1;
      }
      ops.push({
        type: "update",
        filePath,
        oldText: oldLines.join("\n"),
        newText: newLines.join("\n"),
      });
      continue;
    }

    throw new Error(`Unsupported patch line: ${line}`);
  }

  return ops;
}

export async function applySimplePatch(root: string, input: string): Promise<string[]> {
  const ops = parseSimplePatch(input);
  const changed: string[] = [];

  for (const op of ops) {
    const target = path.resolve(root, op.filePath);
    if (!target.startsWith(path.resolve(root))) {
      throw new Error(`Patch target outside workspace: ${op.filePath}`);
    }

    if (op.type === "add") {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, op.content, "utf8");
      changed.push(op.filePath);
      continue;
    }

    if (op.type === "delete") {
      await fs.rm(target, { force: true });
      changed.push(op.filePath);
      continue;
    }

    const current = await fs.readFile(target, "utf8");
    if (!op.oldText.trim()) {
      await fs.writeFile(target, op.newText, "utf8");
    } else if (current.includes(op.oldText)) {
      await fs.writeFile(target, current.replace(op.oldText, op.newText), "utf8");
    } else {
      throw new Error(`Patch context not found in ${op.filePath}`);
    }
    changed.push(op.filePath);
  }

  return changed;
}

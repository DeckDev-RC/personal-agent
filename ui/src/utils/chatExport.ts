/**
 * Utility functions for exporting chat conversations.
 */

type Message = {
  role: string;
  content: string;
  timestamp: number;
  toolName?: string;
};

type Conversation = {
  title: string;
  messages: Message[];
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}

function roleLabel(role: string, toolName?: string): string {
  if (role === "tool" && toolName) {
    return `Tool (${toolName})`;
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Creates a Markdown document from a conversation.
 *
 * Each message is rendered with a role header and its content.
 * Timestamps are included as HTML comments.
 */
export function exportAsMarkdown(conversation: Conversation): string {
  const lines: string[] = [];

  lines.push(`# ${conversation.title}`);
  lines.push("");

  for (const msg of conversation.messages) {
    lines.push(`<!-- ${formatTimestamp(msg.timestamp)} -->`);
    lines.push(`## ${roleLabel(msg.role, msg.toolName)}`);
    lines.push("");
    lines.push(msg.content);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Returns a pretty-printed JSON representation of the conversation.
 */
export function exportAsJson(conversation: Conversation): string {
  return JSON.stringify(conversation, null, 2);
}

/**
 * Triggers a file download in the browser by creating a temporary
 * blob URL and clicking a hidden anchor element.
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

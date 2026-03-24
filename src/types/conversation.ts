export type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  model?: string;
  thinkingContent?: string;
  toolCallId?: string;
  toolName?: string;
  attachments?: Array<{
    artifactId: string;
    sessionId: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    extractedTextAvailable: boolean;
    bytesBase64: string;
  }>;
};

export type Conversation = {
  id: string;
  title: string;
  agentId?: string;
  projectContextId?: string;
  model: string;
  systemPrompt: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
};

export type ConversationSummary = {
  id: string;
  title: string;
  agentId?: string;
  projectContextId?: string;
  model: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
};

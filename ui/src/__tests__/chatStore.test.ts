import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "../stores/chatStore";

describe("chatStore", () => {
  beforeEach(() => {
    useChatStore.setState({
      conversations: [],
      activeConversation: null,
      streaming: false,
      streamingText: "",
      thinkingText: "",
      activeRunId: undefined,
      activePhase: undefined,
      uiMode: "simple",
      showInternalPhases: false,
      collapsedInspectorSections: ["approvals", "tools", "artifacts", "timing"],
    });
  });

  it("preserves attachments on tool messages", () => {
    useChatStore.getState().createConversation("openai-codex/gpt-5.4", "You are helpful.");

    const attachment = {
      artifactId: "artifact-1",
      sessionId: "session-1",
      fileName: "speech.mp3",
      mimeType: "audio/mpeg",
      byteSize: 2048,
      extractedTextAvailable: false,
      bytesBase64: "ZmFrZQ==",
    };

    useChatStore.getState().addToolMessage({
      toolCallId: "tool-call-1",
      toolName: "text_to_speech",
      content: "Generated 1 audio file(s) with openai.",
      attachments: [attachment],
    });

    const messages = useChatStore.getState().activeConversation?.messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("tool");
    expect(messages[0].attachments).toEqual([attachment]);
  });
});

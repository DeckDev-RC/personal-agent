import { describe, expect, it } from "vitest";
import {
  getConversationDisplayTitle,
  shouldAutoShowAdvancedConsole,
} from "../components/chat/chatUi";

describe("chatUi", () => {
  it("keeps the advanced console hidden for an empty session", () => {
    expect(
      shouldAutoShowAdvancedConsole({
        approvalsCount: 0,
        artifactsCount: 0,
        toolsCount: 0,
        jobsCount: 0,
        browserStatus: undefined,
        workspaceRoot: "",
        workspaceFileCount: 0,
        workspaceChunkCount: 0,
        showInternalPhases: false,
        planMode: false,
        lastRunStatus: undefined,
        activePhase: undefined,
      }),
    ).toBe(false);
  });

  it("shows the advanced console automatically when operational signals exist", () => {
    expect(
      shouldAutoShowAdvancedConsole({
        approvalsCount: 1,
        artifactsCount: 0,
        toolsCount: 0,
        jobsCount: 0,
        browserStatus: undefined,
        workspaceRoot: "",
        workspaceFileCount: 0,
        workspaceChunkCount: 0,
        showInternalPhases: false,
        planMode: false,
        lastRunStatus: undefined,
        activePhase: undefined,
      }),
    ).toBe(true);
  });

  it("translates the default draft title", () => {
    expect(getConversationDisplayTitle("New session", ((key: string) => (key === "chat.newSession" ? "Nova sessão" : key)) as any)).toBe("Nova sessão");
  });
});

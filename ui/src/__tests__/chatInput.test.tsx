import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import "../i18n";
import ChatInput from "../components/chat/ChatInput";

function ControlledHarness() {
  const [draft, setDraft] = useState("");
  const [, setVersion] = useState(0);

  return (
    <div>
      <button type="button" onClick={() => setVersion((current) => current + 1)}>
        rerender
      </button>
      <button type="button" onClick={() => setDraft("mensagem pronta")}>
        preset
      </button>
      <ChatInput
        onSend={() => undefined}
        onAbort={() => undefined}
        disabled={false}
        streaming={false}
        draftValue={draft}
        onDraftChange={setDraft}
      />
    </div>
  );
}

describe("ChatInput", () => {
  it("keeps the controlled draft stable across parent rerenders", () => {
    render(<ControlledHarness />);

    const textarea = screen.getByRole("textbox");
    textarea.focus();

    fireEvent.change(textarea, {
      target: { value: "olá mundo" },
    });

    expect(textarea).toHaveValue("olá mundo");
    expect(document.activeElement).toBe(textarea);

    fireEvent.click(screen.getByRole("button", { name: "rerender" }));

    expect(textarea).toHaveValue("olá mundo");
    expect(document.activeElement).toBe(textarea);

    fireEvent.click(screen.getByRole("button", { name: "preset" }));

    expect(textarea).toHaveValue("mensagem pronta");
  });
});

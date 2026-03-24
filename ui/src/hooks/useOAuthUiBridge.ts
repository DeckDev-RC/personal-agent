import { useEffect, useMemo, useState } from "react";

type OAuthPromptPayload = {
  message: string;
  placeholder?: string;
};

const EMPTY_PROMPT = {
  open: false,
  message: "",
  placeholder: "",
  value: "",
};

export function useOAuthUiBridge() {
  const [progressMessage, setProgressMessage] = useState("");
  const [promptState, setPromptState] = useState(EMPTY_PROMPT);

  useEffect(() => {
    const api = (window as any).codexAgent;
    const unsubscribePrompt = api?.onOAuthPrompt?.((payload: OAuthPromptPayload) => {
      setPromptState({
        open: true,
        message: payload.message,
        placeholder: payload.placeholder ?? "",
        value: "",
      });
    });
    const unsubscribeProgress = api?.onProgress?.((message: string) => {
      setProgressMessage(String(message ?? "").trim());
    });
    const unsubscribeDismissed = api?.onOAuthPromptDismissed?.(() => {
      setPromptState(EMPTY_PROMPT);
    });

    return () => {
      unsubscribePrompt?.();
      unsubscribeProgress?.();
      unsubscribeDismissed?.();
    };
  }, []);

  const prompt = useMemo(
    () => ({
      ...promptState,
      setValue: (value: string) =>
        setPromptState((current) => ({
          ...current,
          value,
        })),
      clear: () => setPromptState(EMPTY_PROMPT),
      submit: () => {
        (window as any).codexAgent?.sendOAuthPromptResponse?.(promptState.value.trim());
        setPromptState(EMPTY_PROMPT);
      },
    }),
    [promptState],
  );

  return {
    progressMessage,
    setProgressMessage,
    clearProgressMessage: () => setProgressMessage(""),
    prompt,
  };
}

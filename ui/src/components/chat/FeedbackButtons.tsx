import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ThumbsUp, ThumbsDown } from "lucide-react";

const api = () => (window as any).codexAgent;

type FeedbackButtonsProps = {
  messageId: string;
  sessionId: string;
};

export default function FeedbackButtons({ messageId, sessionId }: FeedbackButtonsProps) {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState<"positive" | "negative" | null>(null);

  async function handleFeedback(rating: "positive" | "negative") {
    if (submitted) return;
    try {
      await api().feedback.submit({ messageId, sessionId, rating });
      setSubmitted(rating);
    } catch {}
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={() => handleFeedback("positive")}
        disabled={!!submitted}
        className={`p-0.5 rounded cursor-pointer transition-colors ${
          submitted === "positive"
            ? "text-green-400"
            : "text-text-secondary/40 hover:text-green-400"
        }`}
        title={t("feedback.positive", "Boa resposta")}
      >
        <ThumbsUp size={12} />
      </button>
      <button
        onClick={() => handleFeedback("negative")}
        disabled={!!submitted}
        className={`p-0.5 rounded cursor-pointer transition-colors ${
          submitted === "negative"
            ? "text-red-400"
            : "text-text-secondary/40 hover:text-red-400"
        }`}
        title={t("feedback.negative", "Resposta ruim")}
      >
        <ThumbsDown size={12} />
      </button>
    </div>
  );
}

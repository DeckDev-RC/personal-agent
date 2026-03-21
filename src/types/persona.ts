export type FeedbackRating = "positive" | "negative";

export type FeedbackRecord = {
  id: string;
  messageId: string;
  sessionId: string;
  rating: FeedbackRating;
  comment?: string;
  createdAt: number;
};

export type PersonaConfig = {
  tone: "formal" | "casual" | "technical" | "friendly";
  language: string;
  detailLevel: "concise" | "balanced" | "detailed";
  customInstructions?: string;
  examples?: Array<{ input: string; output: string }>;
};

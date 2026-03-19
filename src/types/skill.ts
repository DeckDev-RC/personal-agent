export type Skill = {
  id: string;
  name: string;
  description: string;
  content: string;
  type: "prompt" | "tool";
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

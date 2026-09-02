import type { QuestionCategory } from "../../electron/ai/AIProvider";

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  technical: "Technical",
  coding: "Coding",
  database: "Database",
  data_science: "Data Science",
  machine_learning: "Machine Learning",
  ai: "AI",
  general: "General",
  behavioral: "Behavioral",
  project: "Project-related",
  client: "Client-related",
  communication: "Communication",
  career: "Career",
  presentation: "Presentation",
};

export const CATEGORY_STRUCTURE_NOTE: Record<QuestionCategory, string> = {
  technical: "Prioritizes accuracy and a concise, correct explanation.",
  coding: "Best answered in the Coding Lab — code, complexity, and edge cases.",
  database: "Prioritizes accuracy and a concise, correct explanation.",
  data_science: "Prioritizes accuracy and a concise, correct explanation.",
  machine_learning: "Prioritizes accuracy and a concise, correct explanation.",
  ai: "Prioritizes accuracy and a concise, correct explanation.",
  general: "Direct answer with practical context.",
  behavioral: "Uses a STAR-style structure (Situation, Task, Action, Result).",
  project: "Focuses on scope, your role, and outcomes.",
  client: "Prioritizes clarity, confidence, honesty, and business relevance.",
  communication: "Focuses on clarity and audience fit.",
  career: "Focuses on trajectory, motivation, and growth.",
  presentation: "Best expanded in Presentation Practice for a full structure.",
};

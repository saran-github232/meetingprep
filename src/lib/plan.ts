export interface FeatureInfo {
  id: string;
  label: string;
  tier: "free" | "pro";
  description: string;
}

// No payment provider is wired up yet (Stripe/RevenueCat/etc. would need its own account +
// integration) — this matrix and the Settings toggle just let the gating logic be previewed
// and refined locally before real billing is added.
export const FEATURES: FeatureInfo[] = [
  { id: "practice", label: "Practice & Coding Lab", tier: "free", description: "Unlimited AI-assisted practice answers and coding solutions." },
  { id: "dashboard-streak", label: "Practice streak & category breakdown", tier: "free", description: "Day streak and a per-category activity chart on the Dashboard." },
  { id: "provider-choice", label: "Choice of AI provider", tier: "free", description: "Use Gemini, OpenAI, or Anthropic with your own API key." },
  { id: "history", label: "History, Favorites & tags", tier: "free", description: "Save, search, tag, and star past answers." },
  { id: "markdown-export", label: "Markdown export", tier: "free", description: "Export any answer as a Markdown file." },
  { id: "resources-view", label: "Shared Resources (view)", tier: "free", description: "Sign in and view/open every resource an Admin has published." },
  { id: "review", label: "Spaced-repetition Review", tier: "free", description: "Flashcard-style review of starred answers on a spaced schedule." },
  { id: "pdf-export", label: "PDF export", tier: "pro", description: "Export answers as polished PDF documents." },
  { id: "mock-interview", label: "Mock Interview Mode", tier: "pro", description: "Role- and job-description-tailored multi-question simulated interviews where the AI evaluates your own typed answers — strengths, improvements, and a model answer for comparison." },
  { id: "bulk-export", label: "Bulk export (all history)", tier: "pro", description: "Export your entire Practice + Coding Lab history as one Markdown file." },
  { id: "insights", label: "Insights", tier: "pro", description: "Weakest categories from your Mock Interview scores, plus a full Practice activity breakdown." },
  { id: "resume-tailoring", label: "Resume Tailoring", tier: "pro", description: "Rewrite your saved resume to match a specific job description, with a missing-keywords and ATS-friendliness report. History of past tailored versions is saved." },
];

export function isPro(plan: "free" | "pro" | null, featureId: string): boolean {
  if (plan === "pro") return true;
  return FEATURES.find((f) => f.id === featureId)?.tier !== "pro";
}

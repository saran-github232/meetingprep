import type { StructuredAnswer, CodeAnswer, ResumeTailoringResult, InterviewPrepItem, InterviewFeedback } from "../../electron/ai/AIProvider";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Wraps Markdown in minimal HTML for printToPDF — not a Markdown renderer, just enough
// structure (headings, line breaks) to print legibly.
export function markdownToPrintableHtml(title: string, markdown: string): string {
  const body = escapeHtml(markdown)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\n/g, "<br>");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title
  )}</title><style>body{font-family:sans-serif;font-size:13px;line-height:1.5;padding:24px;color:#111}h1{font-size:18px}h3{font-size:14px;text-transform:uppercase;color:#555;margin-bottom:4px}</style></head><body>${body}</body></html>`;
}

export function answerToMarkdown(question: string, category: string, depth: string, a: StructuredAnswer): string {
  return `# ${question}

_Category: ${category} · Depth: ${depth}_

### Answer
${a.answer}

### Why
${a.why}

### Example
${a.example}

### Key Points
${a.keyPoints.map((p) => `- ${p}`).join("\n")}

### Follow-up
${a.followUp.map((p) => `- ${p}`).join("\n")}
`;
}

export function codeAnswerToMarkdown(instruction: string, a: CodeAnswer): string {
  return `# ${instruction}

### Solution
\`\`\`${a.language}
${a.code}
\`\`\`

### Explanation
${a.explanation}

### Complexity
Time: ${a.timeComplexity}
Space: ${a.spaceComplexity}

### Edge Cases
${a.edgeCases.map((p) => `- ${p}`).join("\n")}

### Alternative Approach
${a.alternativeApproach}

### Common Mistakes
${a.commonMistakes.map((p) => `- ${p}`).join("\n")}
`;
}

export function resumeTailoringToMarkdown(jobTitle: string, r: ResumeTailoringResult): string {
  const score = r.atsScore != null ? `\n### ATS Score\n${r.atsScore}/100\n` : "";
  const breakdown =
    r.atsBreakdown.length > 0
      ? `\n### Score Breakdown\n${r.atsBreakdown
          .map((b) => `- ${b.label}: ${b.score}/${b.max}${b.note ? ` — ${b.note}` : ""}`)
          .join("\n")}\n`
      : "";
  const matched =
    r.matchedKeywords.length > 0
      ? `\n### Matched Keywords\n${r.matchedKeywords.map((p) => `- ${p}`).join("\n")}\n`
      : "";
  const suggestions =
    r.suggestions.length > 0
      ? `\n### Suggestions\n${r.suggestions.map((p) => `- ${p}`).join("\n")}\n`
      : "";
  return `# Tailored Resume${jobTitle ? ` — ${jobTitle}` : ""}

${r.tailoredResume}
${score}${breakdown}${matched}
### Missing Keywords
${r.missingKeywords.map((p) => `- ${p}`).join("\n")}
${suggestions}
### ATS Notes
${r.atsNotes}
`;
}

export function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "answer"
  );
}

export function prepPackToMarkdown(role: string, items: InterviewPrepItem[]): string {
  return `# Predicted Interview Questions${role ? ` — ${role}` : ""}

${items
  .map(
    (item, i) => `### Q${i + 1}
${item.question}
${item.angle ? `\nSuggested angle: ${item.angle}` : ""}`
  )
  .join("\n\n")}
`;
}

/** A full Mock Interview session as one document — every question, your answer, and the feedback. */
export function mockSessionToMarkdown(session: {
  role: string;
  experience: string;
  categories: string[];
  dateISO: string;
  items: { question: string; userAnswer: string; feedback: InterviewFeedback }[];
}): string {
  const scores = session.items
    .map((i) => i.feedback.score.match(/(\d+(?:\.\d+)?)\s*\/\s*10/))
    .filter((m): m is RegExpMatchArray => m != null)
    .map((m) => Number(m[1]));
  const average = scores.length
    ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    : null;
  const header = [
    "# Mock Interview Report",
    "",
    "### Session",
    `${new Date(session.dateISO).toLocaleString()} · Role: ${session.role || "—"} · Level: ${session.experience}${
      session.categories.length ? ` · Categories: ${session.categories.join(", ")}` : ""
    }`,
  ];
  if (average) header.push("", "### Average Score", `${average}/10 across ${scores.length} scored answer${scores.length === 1 ? "" : "s"}`);
  const body = session.items.map((item, i) =>
    [
      `### Question ${i + 1}`,
      item.question,
      "",
      "### Your Answer",
      item.userAnswer || "(not recorded)",
      "",
      `### Feedback — Score`,
      item.feedback.score,
      "",
      "### Feedback — Strengths",
      ...(item.feedback.strengths.length ? item.feedback.strengths.map((s) => `- ${s}`) : ["- (none listed)"]),
      "",
      "### Feedback — Improvements",
      ...(item.feedback.improvements.length ? item.feedback.improvements.map((s) => `- ${s}`) : ["- (none listed)"]),
      "",
      "### Model Answer",
      item.feedback.modelAnswer,
    ].join("\n")
  );
  return [...header, "", body.join("\n\n"), ""].join("\n");
}

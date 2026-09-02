import type { CodeAnswer, InterviewFeedback, ResumeTailoringResult, StructuredAnswer } from "../../electron/ai/AIProvider";

export function rawAnswerText(json: string): string {
  try {
    return (JSON.parse(json) as { raw?: string }).raw ?? json;
  } catch {
    return json;
  }
}

function splitSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = raw.split(/^### +(.+?) *$/m);
  for (let i = 1; i < parts.length; i += 2) {
    sections[parts[i].trim().toLowerCase()] = (parts[i + 1] ?? "").trim();
  }
  return sections;
}

function bulletList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line && !/^[—–-]+$/.test(line));
}

export function parseStructuredAnswer(raw: string): StructuredAnswer {
  const s = splitSections(raw);
  return {
    answer: s["answer"] ?? raw.trim(),
    why: s["why"] ?? "",
    example: s["example"] ?? "",
    keyPoints: bulletList(s["key points"] ?? ""),
    followUp: bulletList(s["follow-up"] ?? s["follow up"] ?? ""),
  };
}

export function parseInterviewFeedback(raw: string): InterviewFeedback {
  const s = splitSections(raw);
  return {
    score: s["score"] ?? "",
    strengths: bulletList(s["strengths"] ?? ""),
    improvements: bulletList(s["improvements"] ?? ""),
    modelAnswer: s["model answer"] ?? "",
  };
}

export function parseResumeTailoring(raw: string): ResumeTailoringResult {
  const s = splitSections(raw);

  const scoreText = s["ats score"] ?? "";
  const scoreMatch = scoreText.match(/(\d+)\s*\/\s*100/);
  const atsScore = scoreMatch ? Number(scoreMatch[1]) : null;

  const atsBreakdown = bulletList(s["score breakdown"] ?? "").flatMap((line) => {
    const match = line.match(/^(.+?):\s*(\d+)\s*\/\s*(\d+)\s*(?:[—–-]\s*(.*))?$/);
    if (!match) return [];
    return [
      {
        label: match[1].trim(),
        score: Number(match[2]),
        max: Number(match[3]),
        note: (match[4] ?? "").trim(),
      },
    ];
  });

  return {
    tailoredResume: s["tailored resume"] ?? raw.trim(),
    missingKeywords: bulletList(s["missing keywords"] ?? ""),
    atsNotes: s["ats notes"] ?? "",
    atsScore,
    atsBreakdown,
    matchedKeywords: bulletList(s["matched keywords"] ?? ""),
    suggestions: bulletList(s["suggestions"] ?? ""),
  };
}

export function parseCodeAnswer(raw: string, language: string): CodeAnswer {
  const s = splitSections(raw);
  const solutionBlock = s["solution"] ?? raw;
  const codeMatch = solutionBlock.match(/```[\w+-]*\n([\s\S]*?)```/);
  const complexity = s["complexity"] ?? "";
  const timeMatch = complexity.match(/time:\s*(.+)/i);
  const spaceMatch = complexity.match(/space:\s*(.+)/i);
  return {
    code: (codeMatch ? codeMatch[1] : solutionBlock).trim(),
    language,
    explanation: s["explanation"] ?? "",
    timeComplexity: timeMatch?.[1]?.trim() ?? "",
    spaceComplexity: spaceMatch?.[1]?.trim() ?? "",
    edgeCases: bulletList(s["edge cases"] ?? ""),
    alternativeApproach: s["alternative approach"] ?? "",
    commonMistakes: bulletList(s["common mistakes"] ?? ""),
  };
}

import HistoryList from "../components/HistoryList";
import { parseStructuredAnswer, parseCodeAnswer, rawAnswerText } from "../lib/parseAnswer";
import { answerToMarkdown, codeAnswerToMarkdown } from "../lib/export";
import { usePlan } from "../lib/usePlan";
import { isPro } from "../lib/plan";

export default function History() {
  const plan = usePlan();

  async function exportAll() {
    if (!isPro(plan, "bulk-export")) {
      alert("Bulk export is a Pro feature. Preview it in Settings > Plan.");
      return;
    }
    const [qaRows, codingRows] = await Promise.all([window.api.qa.list(), window.api.coding.list()]);
    if (qaRows.length === 0 && codingRows.length === 0) {
      alert("No history yet to export.");
      return;
    }
    const sections = [
      ...qaRows.map((r) =>
        answerToMarkdown(r.question, r.category, r.depth, parseStructuredAnswer(rawAnswerText(r.answer_json)))
      ),
      ...codingRows.map((r) =>
        codeAnswerToMarkdown(r.question, parseCodeAnswer(rawAnswerText(r.explanation_json), r.language))
      ),
    ];
    window.api.export.markdown(sections.join("\n\n---\n\n"), "meetingprep-history.md");
  }

  return (
    <div className="page max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">History</h1>
        <button
          onClick={exportAll}
          className="btn-secondary btn-xs"
        >
          Export All{!isPro(plan, "bulk-export") && " 🔒"}
        </button>
      </div>
      <HistoryList favoritesOnly={false} />
    </div>
  );
}

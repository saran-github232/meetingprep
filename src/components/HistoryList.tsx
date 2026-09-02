import { useEffect, useMemo, useState } from "react";
import type { QAHistoryRow as QARow, CodingHistoryRow as CodingRow } from "../../electron/db/db";
import { parseStructuredAnswer, parseCodeAnswer, rawAnswerText } from "../lib/parseAnswer";
import { answerToMarkdown, codeAnswerToMarkdown, slugify } from "../lib/export";
import { Section, BulletSection } from "./AnswerSections";
import { IconChevron, IconStar, IconTrash } from "./icons";

function tagList(tags: string): string[] {
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}

function TagsEditor({ tags, onSave }: { tags: string; onSave: (tags: string) => void }) {
  const [value, setValue] = useState(tags);
  useEffect(() => setValue(tags), [tags]);
  return (
    <input
      className="input py-1.5 text-xs"
      placeholder="tags, comma-separated…"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== tags && onSave(value)}
    />
  );
}

export default function HistoryList({ favoritesOnly }: { favoritesOnly: boolean }) {
  const [tab, setTab] = useState<"qa" | "coding">("qa");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [qaRows, setQaRows] = useState<QARow[]>([]);
  const [codingRows, setCodingRows] = useState<CodingRow[]>([]);

  function refresh() {
    window.api.qa.list(search || undefined).then(setQaRows);
    window.api.coding.list().then(setCodingRows);
  }

  useEffect(refresh, [search]);

  const allTags = useMemo(
    () => Array.from(new Set([...qaRows, ...codingRows].flatMap((r) => tagList(r.tags)))).sort(),
    [qaRows, codingRows]
  );

  const visibleQa = qaRows.filter(
    (r) => (!favoritesOnly || r.favorited) && (!tagFilter || tagList(r.tags).includes(tagFilter))
  );
  const visibleCoding = codingRows.filter(
    (r) =>
      (!favoritesOnly || r.favorited) &&
      (!tagFilter || tagList(r.tags).includes(tagFilter)) &&
      r.question.toLowerCase().includes(search.toLowerCase())
  );

  async function toggleQaFavorite(row: QARow) {
    await window.api.qa.favorite(row.id, !row.favorited);
    refresh();
  }
  async function deleteQa(id: number) {
    await window.api.qa.delete(id);
    refresh();
  }
  async function saveQaTags(id: number, tags: string) {
    await window.api.qa.setTags(id, tags);
    refresh();
  }
  async function toggleCodingFavorite(row: CodingRow) {
    await window.api.coding.favorite(row.id, !row.favorited);
    refresh();
  }
  async function deleteCoding(id: number) {
    await window.api.coding.delete(id);
    refresh();
  }
  async function saveCodingTags(id: number, tags: string) {
    await window.api.coding.setTags(id, tags);
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setTab("qa")}
          className={`chip ${tab === "qa" ? "chip-active" : "chip-idle"}`}
        >
          Practice <span className="font-mono text-xs opacity-70">{visibleQa.length}</span>
        </button>
        <button
          onClick={() => setTab("coding")}
          className={`chip ${tab === "coding" ? "chip-active" : "chip-idle"}`}
        >
          Coding <span className="font-mono text-xs opacity-70">{visibleCoding.length}</span>
        </button>
        {allTags.length > 0 && (
          <select
            className="select w-auto py-1.5"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <input
          className="input ml-auto w-48"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {tab === "qa" &&
          visibleQa.map((row) => (
            <details key={row.id} className="disclosure group">
              <summary>
                <span className="text-[13.5px] font-medium tracking-tight">{row.question}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="badge-teal capitalize">{row.category}</span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      toggleQaFavorite(row);
                    }}
                    title="Toggle favorite"
                    className={`rounded-md p-1 transition-colors ${
                      row.favorited ? "text-gold" : "text-faint hover:text-gold"
                    }`}
                  >
                    <IconStar size={14} fill={row.favorited ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      deleteQa(row.id);
                    }}
                    title="Delete"
                    className="rounded-md p-1 text-faint transition-colors hover:text-danger"
                  >
                    <IconTrash size={14} />
                  </button>
                  <IconChevron size={13} className="disclosure-chevron" />
                </span>
              </summary>
              {(() => {
                const parsed = parseStructuredAnswer(rawAnswerText(row.answer_json));
                return (
                  <div className="space-y-4 p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <TagsEditor tags={row.tags} onSave={(t) => saveQaTags(row.id, t)} />
                      </div>
                      <button
                        onClick={() =>
                          window.api.export.markdown(
                            answerToMarkdown(row.question, row.category, row.depth, parsed),
                            `${slugify(row.question)}.md`
                          )
                        }
                        className="btn-secondary btn-xs shrink-0"
                      >
                        Export
                      </button>
                    </div>
                    <Section title="Answer" text={parsed.answer} />
                    <Section title="Why" text={parsed.why} />
                    <Section title="Example" text={parsed.example} />
                    <BulletSection title="Key Points" items={parsed.keyPoints} />
                    <BulletSection title="Follow-up" items={parsed.followUp} />
                  </div>
                );
              })()}
            </details>
          ))}

        {tab === "coding" &&
          visibleCoding.map((row) => (
            <details key={row.id} className="disclosure group">
              <summary>
                <span className="text-[13.5px] font-medium tracking-tight">{row.question}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="badge-teal uppercase">{row.language}</span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      toggleCodingFavorite(row);
                    }}
                    title="Toggle favorite"
                    className={`rounded-md p-1 transition-colors ${
                      row.favorited ? "text-gold" : "text-faint hover:text-gold"
                    }`}
                  >
                    <IconStar size={14} fill={row.favorited ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      deleteCoding(row.id);
                    }}
                    title="Delete"
                    className="rounded-md p-1 text-faint transition-colors hover:text-danger"
                  >
                    <IconTrash size={14} />
                  </button>
                  <IconChevron size={13} className="disclosure-chevron" />
                </span>
              </summary>
              {(() => {
                const parsed = parseCodeAnswer(rawAnswerText(row.explanation_json), row.language);
                return (
                  <div className="space-y-4 p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <TagsEditor tags={row.tags} onSave={(t) => saveCodingTags(row.id, t)} />
                      </div>
                      <button
                        onClick={() =>
                          window.api.export.markdown(
                            codeAnswerToMarkdown(row.question, parsed),
                            `${slugify(row.question)}.md`
                          )
                        }
                        className="btn-secondary btn-xs shrink-0"
                      >
                        Export
                      </button>
                    </div>
                    <pre className="code-block whitespace-pre-wrap">{row.code || parsed.code}</pre>
                    <Section title="Explanation" text={parsed.explanation} />
                    <BulletSection title="Edge Cases" items={parsed.edgeCases} />
                    <Section title="Alternative Approach" text={parsed.alternativeApproach} />
                    <BulletSection title="Common Mistakes" items={parsed.commonMistakes} />
                  </div>
                );
              })()}
            </details>
          ))}

        {tab === "qa" && visibleQa.length === 0 && (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-hairline py-10 text-[13px] text-faint">
            {favoritesOnly ? "No favorited practice answers yet." : "No practice history yet."}
          </div>
        )}
        {tab === "coding" && visibleCoding.length === 0 && (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-hairline py-10 text-[13px] text-faint">
            {favoritesOnly ? "No favorited coding answers yet." : "No coding history yet."}
          </div>
        )}
      </div>
    </div>
  );
}

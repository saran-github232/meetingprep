import DOMPurify from "dompurify";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Inline markdown (bold / italic / code) → sanitized HTML. Used for AI answer text,
 * which commonly arrives with **emphasis** markers, inside whitespace-pre-wrap blocks.
 */
export function inlineMarkdownHtml(text: string): string {
  const escaped = escapeHtml(text);
  const withMd = escaped
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/g, "$1<em>$2</em>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
  return DOMPurify.sanitize(withMd, { ALLOWED_TAGS: ["strong", "em", "code", "br"], ALLOWED_ATTR: [] });
}

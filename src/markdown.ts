import { SegmentTranslation } from "./types";

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}\[\]()#+.!|>~-]/g, "\\$&");
}

function escapeInlineCode(value: string): string {
  return value.replace(/`/g, "\\`");
}

function normalizeDetail(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

function formatDetail(value: string): string {
  const lines = normalizeDetail(value).split(/\r?\n/);
  return lines
    .map((line, index) => `${index === 0 ? "" : "  " + "  "}${escapeMarkdown(line)}`)
    .join("  \n");
}

function sourceLabel(source: SegmentTranslation["source"]): string {
  switch (source) {
    case "google":
      return "Google 在线回退";
    case "none":
      return "未找到";
    default:
      return "本地词库";
  }
}

export function buildHoverMarkdown(originText: string, results: SegmentTranslation[]): string {
  const lines = [`翻译 \`${escapeInlineCode(originText)}\``, ""];
  for (const result of results) {
    const details = result.translation ? formatDetail(result.translation) : "本地词库暂无结果，在线翻译也暂时不可用。";
    const phonetic = result.phonetic ? ` _${escapeMarkdown(result.phonetic)}_` : "";
    const partOfSpeech = result.partOfSpeech ? ` _${escapeMarkdown(result.partOfSpeech)}_` : "";
    const headword = result.headword && result.headword.toLowerCase() !== result.term.toLowerCase()
      ? ` （词形：\`${escapeInlineCode(result.headword)}\`）`
      : "";
    lines.push(`- \`${escapeInlineCode(result.term)}\`${phonetic}${partOfSpeech}${headword}：${details} _（${sourceLabel(result.source)}）_`);
  }

  return lines.join("\n");
}

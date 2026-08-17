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

function formatPhonetic(value: string | undefined): string {
  if (!value) {
    return "";
  }

  const normalized = value.trim().replace(/^\/+|\/+$/g, "");
  return normalized ? ` /${escapeMarkdown(normalized)}/` : "";
}

export function buildHoverMarkdown(originText: string, results: SegmentTranslation[]): string {
  const blocks: string[] = [];
  for (const result of results) {
    const details = result.status === "loading"
      ? result.source === "google" ? "$(sync~spin) 正在在线翻译…" : "$(sync~spin) 正在查询本地词库…"
      : result.status === "error"
        ? `在线翻译失败：${escapeMarkdown(result.error || "未知错误")}`
        : result.translation
          ? formatDetail(result.translation)
          : "暂无译文";
    const firstLine = `\`${escapeInlineCode(result.term)}\`${formatPhonetic(result.phonetic)}`;
    blocks.push(`${firstLine}  \n${details}`);
  }

  return [`翻译 \`${escapeInlineCode(originText)}\``, "", blocks.join("\n\n*****\n\n")].join("\n");
}

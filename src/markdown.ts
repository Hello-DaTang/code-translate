import { SegmentTranslation } from "./types";

const CODE_MARK = String.fromCharCode(96);
const LINE_BREAK = String.fromCharCode(10);
const ESCAPED_LINE_BREAK = String.fromCharCode(92) + "n";

export const markdownHeader = "翻译 " + CODE_MARK + "$word" + CODE_MARK + " :  " + LINE_BREAK;
export const markdownFooter = "  " + LINE_BREAK;
export const markdownLine = "  " + LINE_BREAK + "*****" + LINE_BREAK;

function normalizePhonetic(value: string): string {
  return value.trim().replace(/^[/]+|[/]+$/g, "");
}

function formatTranslation(value: string): string {
  return value.split(ESCAPED_LINE_BREAK).join("  " + LINE_BREAK);
}

// Mirrors the original index.js genMarkdown function while keeping the requested
// no-link, term/phonetic, next-line translation layout.
export function genMarkdown(word: string, translation: string, phonetic?: string): string {
  const normalizedPhonetic = phonetic ? normalizePhonetic(phonetic) : "";
  const formattedPhonetic = normalizedPhonetic ? " /" + normalizedPhonetic + "/" : "";
  const details = translation ? formatTranslation(translation) : "暂无译文";
  return CODE_MARK + word + CODE_MARK + formattedPhonetic + "  " + LINE_BREAK + details;
}

export function buildHoverMarkdown(originText: string, results: SegmentTranslation[]): string {
  let hoverText = "";
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (i === 0) {
      hoverText += genMarkdown(result.term, result.translation, result.phonetic);
    } else {
      hoverText += markdownLine + genMarkdown(result.term, result.translation, result.phonetic);
    }
  }

  const header = markdownHeader.replace("$word", originText);
  return header + hoverText + markdownFooter;
}

import * as vscode from "vscode";
import { DictionaryStore } from "./dictionary-store";
import { defaultGoogleClientKey, translateWithGoogle } from "./google-translator";
import { SegmentTranslation } from "./types";

function emptyResult(word: string): SegmentTranslation {
  return {
    term: word,
    translation: "",
    source: "none",
  };
}

function targetLanguageFor(word: string): "en" | "zh-CN" {
  return /\p{Script=Han}/u.test(word) ? "en" : "zh-CN";
}

function timeoutSetting(): number {
  const value = vscode.workspace.getConfiguration("codeTranslate").get<number>("remoteTimeoutMs", 3500);
  return Number.isFinite(value) ? value : 3500;
}

export async function querySentence(text: string): Promise<string> {
  const sentence = text.trim();
  if (!sentence) {
    return "";
  }

  const settings = vscode.workspace.getConfiguration("codeTranslate");
  if (!settings.get<boolean>("remoteFallback", true)) {
    return "";
  }

  const apiKey = settings.get<string>("googleApiKey", defaultGoogleClientKey()).trim();
  try {
    const translations = await translateWithGoogle(
      [sentence],
      targetLanguageFor(sentence),
      apiKey,
      timeoutSetting(),
    );
    return translations[0]?.trim() ?? "";
  } catch {
    return "";
  }
}

// Mirrors the original query.js function: resolve one word, then let the
// caller decide how to append it to the Hover text.
export async function query(
  word: string,
  dictionary: DictionaryStore,
): Promise<SegmentTranslation> {
  if (word.length <= 1) {
    return emptyResult(word);
  }

  const local = await dictionary.lookup(word);
  if (local) {
    return {
      term: word,
      translation: local.translation,
      phonetic: local.phonetic,
      partOfSpeech: local.partOfSpeech,
      headword: local.headword,
      source: local.source,
    };
  }

  const settings = vscode.workspace.getConfiguration("codeTranslate");
  if (!settings.get<boolean>("remoteFallback", true)) {
    return emptyResult(word);
  }

  const apiKey = settings.get<string>("googleApiKey", defaultGoogleClientKey()).trim();
  try {
    const translations = await translateWithGoogle(
      [word],
      targetLanguageFor(word),
      apiKey,
      timeoutSetting(),
    );
    const translation = translations[0]?.trim() ?? "";
    return translation ? { term: word, translation, source: "google" } : emptyResult(word);
  } catch {
    return emptyResult(word);
  }
}

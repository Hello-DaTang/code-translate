import type * as vscode from "vscode";

const TRANSLATE_HTML_ENDPOINT = "https://translate-pa.googleapis.com/v1/translateHtml";
const DEFAULT_GOOGLE_CLIENT_KEY = "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520";

function collectTranslations(payload: unknown): string[] {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return [];
  }

  return payload[0].map((item: unknown) => {
    if (typeof item === "string") {
      return item;
    }
    if (Array.isArray(item)) {
      return item.filter((part): part is string => typeof part === "string").join("");
    }
    return "";
  });
}

export function defaultGoogleClientKey(): string {
  return DEFAULT_GOOGLE_CLIENT_KEY;
}

export async function translateWithGoogle(
  texts: string[],
  targetLanguage: "en" | "zh-CN",
  apiKey: string,
  timeoutMs: number,
  cancellationToken?: vscode.CancellationToken,
): Promise<string[]> {
  if (texts.length === 0) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const cancellationSubscription = cancellationToken?.onCancellationRequested(() => controller.abort());

  try {
    const response = await fetch(TRANSLATE_HTML_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json+protobuf",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify([[texts, "auto", targetLanguage], "wt_lib"]),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Google Translate returned HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();
    const translations = collectTranslations(payload);
    if (translations.length !== texts.length) {
      throw new Error("Google Translate returned an unexpected response");
    }
    return translations;
  } finally {
    clearTimeout(timeout);
    cancellationSubscription?.dispose();
  }
}

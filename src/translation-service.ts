import * as vscode from "vscode";
import { containsChinese } from "./word-parser";
import { DictionaryStore } from "./dictionary-store";
import { defaultGoogleClientKey, translateWithGoogle } from "./google-translator";
import { DictionaryEntry, SegmentTranslation } from "./types";

function targetLanguageFor(segments: string[]): "en" | "zh-CN" {
  return segments.some(containsChinese) ? "en" : "zh-CN";
}

function configNumber(name: string, fallback: number): number {
  const value = vscode.workspace.getConfiguration("codeTranslate").get<number>(name, fallback);
  return Number.isFinite(value) ? value : fallback;
}

export class TranslationService {
  private readonly remoteCache = new Map<string, string | undefined>();
  private readonly remoteInFlight = new Map<string, Promise<string[]>>();

  public constructor(private readonly dictionary: DictionaryStore) {}

  public async translateSegments(
    segments: string[],
    cancellationToken: vscode.CancellationToken,
  ): Promise<SegmentTranslation[]> {
    const uniqueSegments = Array.from(new Set(segments.filter(Boolean)));
    const localResults = new Map<string, DictionaryEntry>();
    const missing: string[] = [];

    for (const segment of uniqueSegments) {
      if (cancellationToken.isCancellationRequested) {
        return [];
      }
      const local = await this.dictionary.lookup(segment);
      if (local) {
        localResults.set(segment, local);
      } else {
        missing.push(segment);
      }
    }

    const settings = vscode.workspace.getConfiguration("codeTranslate");
    const remoteFallback = settings.get<boolean>("remoteFallback", true);
    const remoteResults = new Map<string, string | undefined>();
    if (remoteFallback && missing.length > 0 && !cancellationToken.isCancellationRequested) {
      const targetLanguage = targetLanguageFor(missing);
      const apiKey = settings.get<string>("googleApiKey", defaultGoogleClientKey()).trim();
      const timeoutMs = configNumber("remoteTimeoutMs", 3500);
      const maxSegments = Math.max(1, Math.floor(configNumber("maxSegments", 24)));
      const batch = missing.slice(0, maxSegments);
      const translated = await this.translateMissing(batch, targetLanguage, apiKey, timeoutMs, cancellationToken);
      batch.forEach((segment, index) => remoteResults.set(segment, translated[index]));
    }

    return uniqueSegments.map((segment) => {
      const local = localResults.get(segment);
      if (local) {
        return {
          term: segment,
          translation: local.translation,
          phonetic: local.phonetic,
          partOfSpeech: local.partOfSpeech,
          headword: local.headword,
          source: local.source,
        } satisfies SegmentTranslation;
      }

      const remote = remoteResults.get(segment);
      if (remote) {
        return {
          term: segment,
          translation: remote,
          source: "google",
        } satisfies SegmentTranslation;
      }

      return {
        term: segment,
        translation: "",
        source: "none",
      } satisfies SegmentTranslation;
    });
  }

  private async translateMissing(
    segments: string[],
    targetLanguage: "en" | "zh-CN",
    apiKey: string,
    timeoutMs: number,
    cancellationToken: vscode.CancellationToken,
  ): Promise<Array<string | undefined>> {
    const result = new Array<string | undefined>(segments.length);
    const unresolved: string[] = [];

    for (const segment of segments) {
      const cacheKey = `${targetLanguage}:${segment}`;
      if (this.remoteCache.has(cacheKey)) {
        result[segments.indexOf(segment)] = this.remoteCache.get(cacheKey);
      } else {
        unresolved.push(segment);
      }
    }

    const uniqueUnresolved = Array.from(new Set(unresolved));
    if (uniqueUnresolved.length > 0) {
      const requestKey = `${targetLanguage}:${uniqueUnresolved.join("\u0000")}`;
      let request = this.remoteInFlight.get(requestKey);
      if (!request) {
        request = translateWithGoogle(uniqueUnresolved, targetLanguage, apiKey, timeoutMs, cancellationToken)
          .then((translations) => {
            translations.forEach((translation, index) => {
              this.remoteCache.set(`${targetLanguage}:${uniqueUnresolved[index]}`, translation || undefined);
            });
            return translations;
          })
          .catch(() => {
            uniqueUnresolved.forEach((segment) => this.remoteCache.set(`${targetLanguage}:${segment}`, undefined));
            return [];
          })
          .finally(() => this.remoteInFlight.delete(requestKey));
        this.remoteInFlight.set(requestKey, request);
      }
      await request;
    }

    segments.forEach((segment, index) => {
      result[index] = this.remoteCache.get(`${targetLanguage}:${segment}`);
    });
    return result;
  }
}

import * as vscode from "vscode";
import { containsChinese } from "./word-parser";
import { DictionaryStore } from "./dictionary-store";
import { defaultGoogleClientKey, translateWithGoogle } from "./google-translator";
import { SegmentTranslation } from "./types";

const REMOTE_FAILURE_RETRY_MS = 10_000;

export type RemoteTranslationState =
  | { status: "unrequested" }
  | { status: "loading" }
  | { status: "ready"; translation: string }
  | { status: "error"; error: string };

export function targetLanguageFor(segments: string[]): "en" | "zh-CN" {
  return segments.some(containsChinese) ? "en" : "zh-CN";
}

function configNumber(name: string, fallback: number): number {
  const value = vscode.workspace.getConfiguration("codeTranslate").get<number>(name, fallback);
  return Number.isFinite(value) ? value : fallback;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "AbortError" ? "请求超时" : error.message;
  }
  return String(error || "未知错误");
}

export class TranslationService {
  private readonly remoteCache = new Map<string, string>();
  private readonly remoteFailures = new Map<string, { message: string; failedAt: number }>();
  private readonly remotePending = new Set<string>();
  private readonly remoteSegmentInFlight = new Map<string, Promise<void>>();
  private readonly remoteInFlight = new Map<string, Promise<void>>();

  public constructor(private readonly dictionary: DictionaryStore) {}

  public async translateSegments(
    segments: string[],
    cancellationToken: vscode.CancellationToken,
  ): Promise<SegmentTranslation[]> {
    const localResults = await this.translateLocalSegments(segments, cancellationToken);
    if (cancellationToken.isCancellationRequested || localResults.length === 0) {
      return [];
    }

    const missing = localResults
      .filter((result) => result.source === "none")
      .map((result) => result.term);
    if (this.isRemoteFallbackEnabled() && missing.length > 0) {
      await this.ensureRemote(missing, targetLanguageFor(missing));
    }
    return this.mergeRemoteResults(localResults, targetLanguageFor(missing));
  }

  public async translateLocalSegments(
    segments: string[],
    cancellationToken?: vscode.CancellationToken,
  ): Promise<SegmentTranslation[]> {
    const uniqueSegments = Array.from(new Set(segments.filter(Boolean)));
    const entries = await Promise.all(uniqueSegments.map(async (segment) => {
      if (cancellationToken?.isCancellationRequested) {
        return undefined;
      }
      return this.dictionary.lookup(segment);
    }));

    if (cancellationToken?.isCancellationRequested) {
      return [];
    }

    return uniqueSegments.map((segment, index) => {
      const local = entries[index];
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

      return {
        term: segment,
        translation: "",
        source: "none",
      } satisfies SegmentTranslation;
    });
  }

  public isRemoteFallbackEnabled(): boolean {
    return vscode.workspace.getConfiguration("codeTranslate").get<boolean>("remoteFallback", true);
  }

  public getRemoteState(segment: string, targetLanguage: "en" | "zh-CN"): RemoteTranslationState {
    const cacheKey = `${targetLanguage}:${segment}`;
    const translation = this.remoteCache.get(cacheKey);
    if (translation) {
      return { status: "ready", translation };
    }

    if (this.remotePending.has(cacheKey)) {
      return { status: "loading" };
    }

    const failure = this.remoteFailures.get(cacheKey);
    if (!failure) {
      return { status: "unrequested" };
    }

    if (Date.now() - failure.failedAt >= REMOTE_FAILURE_RETRY_MS) {
      this.remoteFailures.delete(cacheKey);
      return { status: "unrequested" };
    }

    return { status: "error", error: failure.message };
  }

  public mergeRemoteResults(
    localResults: SegmentTranslation[],
    targetLanguage: "en" | "zh-CN",
  ): SegmentTranslation[] {
    return localResults.map((result) => {
      if (result.source !== "none") {
        return result;
      }

      const remote = this.getRemoteState(result.term, targetLanguage);
      if (remote.status === "ready") {
        return {
          ...result,
          translation: remote.translation,
          source: "google",
          status: undefined,
          error: undefined,
        } satisfies SegmentTranslation;
      }
      if (remote.status === "loading") {
        return {
          ...result,
          source: "google",
          status: "loading",
          error: undefined,
        } satisfies SegmentTranslation;
      }
      if (remote.status === "error") {
        return {
          ...result,
          source: "google",
          status: "error",
          error: remote.error,
        } satisfies SegmentTranslation;
      }
      return result;
    });
  }

  public async ensureRemote(
    segments: string[],
    targetLanguage: "en" | "zh-CN",
  ): Promise<void> {
    if (!this.isRemoteFallbackEnabled()) {
      return;
    }

    const settings = vscode.workspace.getConfiguration("codeTranslate");
    const apiKey = settings.get<string>("googleApiKey", defaultGoogleClientKey()).trim();
    const timeoutMs = configNumber("remoteTimeoutMs", 3500);
    const maxSegments = Math.max(1, Math.floor(configNumber("maxSegments", 24)));
    const batch = Array.from(new Set(segments.filter(Boolean))).slice(0, maxSegments);
    const pendingRequests = batch
      .map((segment) => this.remoteSegmentInFlight.get(`${targetLanguage}:${segment}`))
      .filter((request): request is Promise<void> => request !== undefined);
    const unresolved = batch.filter((segment) => this.getRemoteState(segment, targetLanguage).status === "unrequested");

    const requestKey = `${targetLanguage}:${unresolved.join("\u0000")}`;
    let request = this.remoteInFlight.get(requestKey);
    if (!request && unresolved.length > 0) {
      const cacheKeys = unresolved.map((segment) => `${targetLanguage}:${segment}`);
      cacheKeys.forEach((cacheKey) => {
        this.remotePending.add(cacheKey);
        this.remoteFailures.delete(cacheKey);
      });

      const newRequest = translateWithGoogle(unresolved, targetLanguage, apiKey, timeoutMs)
        .then((translations) => {
          translations.forEach((translation, index) => {
            const cacheKey = cacheKeys[index];
            const normalized = translation.trim();
            if (normalized) {
              this.remoteCache.set(cacheKey, normalized);
            } else {
              this.remoteFailures.set(cacheKey, {
                message: "Google 未返回翻译结果",
                failedAt: Date.now(),
              });
            }
          });
        })
        .catch((error: unknown) => {
          const message = errorMessage(error);
          cacheKeys.forEach((cacheKey) => {
            this.remoteFailures.set(cacheKey, { message, failedAt: Date.now() });
          });
        })
        .finally(() => {
          cacheKeys.forEach((cacheKey) => {
            this.remotePending.delete(cacheKey);
            if (this.remoteSegmentInFlight.get(cacheKey) === newRequest) {
              this.remoteSegmentInFlight.delete(cacheKey);
            }
          });
          this.remoteInFlight.delete(requestKey);
        });
      request = newRequest;
      this.remoteInFlight.set(requestKey, newRequest);
      cacheKeys.forEach((cacheKey) => this.remoteSegmentInFlight.set(cacheKey, newRequest));
    }

    await Promise.all(Array.from(new Set([
      ...pendingRequests,
      ...(request ? [request] : []),
    ])));
  }
}

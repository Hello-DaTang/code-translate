import * as vscode from "vscode";
import {
  CompactChineseEntry,
  CompactEnglishEntry,
  DictionaryEntry,
  DictionaryManifest,
} from "./types";

interface CustomDictionary {
  en?: Record<string, CompactEnglishEntry>;
  zh?: Record<string, CompactChineseEntry>;
}

function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder("utf-8").decode(bytes)) as T;
}

function normalizeEnglish(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function normalizeChinese(value: string): string {
  return value.normalize("NFKC").trim();
}

function englishShardName(word: string): string {
  const prefix = word.slice(0, 2);
  return /^[a-z]{2}$/.test(prefix) ? prefix : "__";
}

function chineseShardName(word: string): string {
  const firstCodePoint = word.codePointAt(0) ?? 0;
  return (firstCodePoint >> 8).toString(16).padStart(2, "0");
}

export class DictionaryStore {
  private readonly dictionaryRoot: vscode.Uri;
  private manifestPromise?: Promise<DictionaryManifest>;
  private customPromise?: Promise<CustomDictionary>;
  private readonly shardPromises = new Map<string, Promise<Record<string, CompactEnglishEntry | CompactChineseEntry>>>();

  public constructor(extensionUri: vscode.Uri) {
    this.dictionaryRoot = vscode.Uri.joinPath(extensionUri, "resources", "dictionary");
  }

  public async lookup(value: string): Promise<DictionaryEntry | undefined> {
    if (/\p{Script=Han}/u.test(value)) {
      return this.lookupChinese(value);
    }
    return this.lookupEnglish(value);
  }

  private async loadManifest(): Promise<DictionaryManifest> {
    if (!this.manifestPromise) {
      this.manifestPromise = Promise.resolve(vscode.workspace.fs
        .readFile(vscode.Uri.joinPath(this.dictionaryRoot, "manifest.json")))
        .then((bytes) => decodeJson<DictionaryManifest>(bytes));
    }
    return this.manifestPromise;
  }

  private async loadCustom(): Promise<CustomDictionary> {
    if (!this.customPromise) {
      this.customPromise = Promise.resolve(vscode.workspace.fs
        .readFile(vscode.Uri.joinPath(this.dictionaryRoot, "custom.json")))
        .then((bytes) => decodeJson<CustomDictionary>(bytes));
    }
    return this.customPromise;
  }

  private async loadShard<T extends CompactEnglishEntry | CompactChineseEntry>(directory: string, name: string): Promise<Record<string, T>> {
    const cacheKey = `${directory}/${name}`;
    const cached = this.shardPromises.get(cacheKey);
    if (cached) {
      return cached as Promise<Record<string, T>>;
    }

    const promise = Promise.resolve(vscode.workspace.fs
      .readFile(vscode.Uri.joinPath(this.dictionaryRoot, directory, `${name}.json`)))
      .then((bytes) => decodeJson<Record<string, T>>(bytes))
      .catch((error: unknown) => {
        this.shardPromises.delete(cacheKey);
        throw error;
      });
    this.shardPromises.set(cacheKey, promise as Promise<Record<string, CompactEnglishEntry | CompactChineseEntry>>);
    return promise;
  }

  private async lookupEnglish(value: string): Promise<DictionaryEntry | undefined> {
    const word = normalizeEnglish(value);
    if (!word || !/[a-z]/.test(word)) {
      return undefined;
    }

    const custom = (await this.loadCustom()).en?.[word];
    if (custom) {
      return this.toEnglishEntry(word, custom, "custom");
    }

    const manifest = await this.loadManifest();
    const shard = await this.loadShard<CompactEnglishEntry>(manifest.english.directory, englishShardName(word));
    const entry = shard[word];
    return entry ? this.toEnglishEntry(word, entry, "ecdict") : undefined;
  }

  private async lookupChinese(value: string): Promise<DictionaryEntry | undefined> {
    const word = normalizeChinese(value);
    if (!word || !/\p{Script=Han}/u.test(word)) {
      return undefined;
    }

    const custom = (await this.loadCustom()).zh?.[word];
    if (custom) {
      return this.toChineseEntry(word, custom, "custom");
    }

    const manifest = await this.loadManifest();
    const shard = await this.loadShard<CompactChineseEntry>(manifest.chinese.directory, chineseShardName(word));
    const entry = shard[word];
    return entry ? this.toChineseEntry(word, entry, "cc-cedict") : undefined;
  }

  private toEnglishEntry(word: string, entry: CompactEnglishEntry, source: "ecdict" | "custom"): DictionaryEntry {
    return {
      word,
      translation: entry.t || entry.d || "",
      phonetic: entry.p,
      partOfSpeech: entry.o,
      headword: entry.h,
      source,
    };
  }

  private toChineseEntry(word: string, entry: CompactChineseEntry, source: "cc-cedict" | "custom"): DictionaryEntry {
    return {
      word,
      translation: entry.e || "",
      phonetic: entry.p,
      source,
    };
  }
}

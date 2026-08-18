export type DictionarySource = "ecdict" | "cc-cedict" | "custom" | "google" | "none";

export interface CompactEnglishEntry {
  /** Chinese translation. */
  t?: string;
  /** Phonetic transcription. */
  p?: string;
  /** English definition used when a Chinese translation is unavailable. */
  d?: string;
  /** Part of speech. */
  o?: string;
  /** Original headword when this record is a generated word-form alias. */
  h?: string;
}

export interface CompactChineseEntry {
  /** English translations. */
  e?: string;
  /** Pinyin. */
  p?: string;
}

export interface DictionaryEntry {
  word: string;
  translation: string;
  phonetic?: string;
  partOfSpeech?: string;
  headword?: string;
  source: "ecdict" | "cc-cedict" | "custom";
}

export interface SegmentTranslation {
  term: string;
  translation: string;
  phonetic?: string;
  partOfSpeech?: string;
  headword?: string;
  source: DictionarySource;
}

export interface DictionaryManifest {
  schemaVersion: 1;
  generatedAt: string;
  sources: {
    legacy?: {
      path: string;
      entries: number;
    };
    ecdict: {
      url: string;
      license: string;
      entries: number;
    };
    ccCedict: {
      url: string;
      release: string;
      license: string;
      entries: number;
    };
  };
  english: {
    directory: string;
    prefixLength: 2;
    entries: number;
    shards: number;
  };
  chinese: {
    directory: string;
    bucketShift: 8;
    entries: number;
    shards: number;
  };
}

# Code Translate

Code Translate is a lightweight TypeScript VS Code extension for fast Chinese-English translation while reading code.

It keeps the useful interaction model of the original `w88975.code-translate` extension and updates the implementation around a current, reproducible dictionary build:

- Hover over an identifier or a selected piece of code to see a translation.
- Split `camelCase`, `PascalCase`, `SCREAMING_SNAKE_CASE`, kebab-case, and acronym-heavy names such as `HTTPServerResponse`.
- Look up English in bundled ECDICT-derived shards and Chinese in bundled CC-CEDICT-derived shards.
- Load only the dictionary shard needed for the current word, so activation stays small and fast.
- Batch missing segments into one `translateHtml` request instead of opening a third-party translation link.
- Return the hover immediately with a local-dictionary loading state, then update it with local results, online results, or the actual online error.
- Keep the original immersive hover layout: the first line contains only the term and `/phonetic/`, the translation starts on the next line, and compound terms are separated by `*****` without source labels.
- Continue to work offline for local dictionary hits; network access is used only for missing terms when remote fallback is enabled.
- Run in the desktop and web extension hosts without native SQLite dependencies.

## Build

```bash
npm install
npm run check-types
npm test
npm run build
npm run package
```

The generated VSIX is written to the repository root. `dist/` is a build output and is intentionally not committed.

## Dictionary refresh

The committed shards are generated from the sources listed in [`resources/dictionary/SOURCES.md`](resources/dictionary/SOURCES.md). To refresh them:

```bash
npm run refresh-dictionaries
```

This downloads the current ECDICT CSV and the latest CC-CEDICT release, regenerates lazy-loaded shards, and records SHA-256 hashes. See [`resources/dictionary/LICENSES.md`](resources/dictionary/LICENSES.md) before redistributing the generated data.

The generator also accepts `LEGACY_DICT_ROOT` and can merge the processed two-letter JSON shards from the original Code Translate extension as a compatibility supplement. The current ECDICT snapshot used for this version already covered those legacy keys, so no duplicate legacy entries were added to this build.

## Online fallback

When a local lookup has no result, the extension sends a batched request to:

```text
https://translate-pa.googleapis.com/v1/translateHtml
```

The request uses the same `application/json+protobuf` payload shape used by the Google Translate web client. Configure `codeTranslate.googleApiKey` if the public client key bundled in the default settings is unavailable or if you want to use your own Google API consumer identity. The key is a client-side key, not a private credential; restrict replacement keys in Google Cloud where appropriate.

Set `codeTranslate.remoteFallback` to `false` for a strictly offline mode.

The hover is progressive: it does not wait for the remote request before opening. The extension first shows a loading state, then updates the hover decoration when the local lookup and the optional remote request finish. Remote failures are shown in the hover and are retried after a short cooldown instead of being cached as permanent missing translations.

## Attribution

The extension code is MIT licensed. The bundled data contains ECDICT data under MIT and CC-CEDICT-derived data under CC BY-SA 4.0. Full attribution and source hashes are kept with the data in `resources/dictionary/`.

# Bundled dictionary data

The extension source code is licensed under the MIT License in the repository root. The generated dictionary data has its own upstream licenses:

## ECDICT

ECDICT is an English-to-Chinese dictionary database from [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT). The source project is MIT licensed. Its generated English shards retain that license and attribution.

## CC-CEDICT

The Chinese-to-English shards are derived from [CC-CEDICT](https://cc-cedict.org/), distributed under the Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0). The attribution and source URL are retained in `SOURCES.md`. If you modify or redistribute these derived dictionary shards, follow the CC BY-SA 4.0 terms.

The dictionary generator is `scripts/update-dictionaries.mjs`. Run `npm run refresh-dictionaries` to refresh the bundled data and regenerate the source hashes.

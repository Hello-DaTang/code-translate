import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dictionaryRoot = join(projectRoot, "resources", "dictionary");
const englishRoot = join(dictionaryRoot, "en");
const chineseRoot = join(dictionaryRoot, "zh");

const ECDICT_URL = "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv";
const CC_CEDICT_URL = "https://cc-cedict.org/editor/editor_export_cedict.php?c=gz";
const CC_CEDICT_RELEASE = process.env.CC_CEDICT_RELEASE ?? "2026-08-16";
const ECDICT_FILE = process.env.ECDICT_FILE;
const CC_CEDICT_FILE = process.env.CC_CEDICT_FILE;
const LEGACY_DICT_ROOT = process.env.LEGACY_DICT_ROOT ?? "";
const LEGACY_DICT_LABEL = "original Code Translate extension processed shards";

const customDictionary = {
  en: {
    apparatus: { t: "设备；器具；仪器" },
    bearing: { t: "轴承；方位；承载" },
    dependency: { t: "依赖；依赖项" },
    downstream: { t: "下游" },
    gateway: { t: "网关" },
    fallback: { t: "降级；回退；后备方案" },
    throughput: { t: "吞吐量" },
    utilization: { t: "利用率；稼动率" },
    middleware: { t: "中间件" },
    payload: { t: "载荷；请求数据" },
    production: { t: "生产；产线" },
    repository: { t: "仓库；代码库" },
    serialization: { t: "序列化" },
    deserialization: { t: "反序列化" },
    "work hours": { t: "工时" },
    "product model": { t: "机种；产品型号" },
    "on duty": { t: "上岗；值班" },
    "labor efficiency": { t: "人效；劳动效率" },
  },
  zh: {
    设备: { e: "equipment；device；apparatus" },
    轴承: { e: "bearing" },
    依赖: { e: "dependency" },
    网关: { e: "gateway" },
    降级: { e: "fallback；degradation" },
    吞吐量: { e: "throughput" },
    稼动率: { e: "utilization rate" },
    中间件: { e: "middleware" },
    载荷: { e: "payload" },
    仓库: { e: "repository" },
    序列化: { e: "serialization" },
    反序列化: { e: "deserialization" },
    工时: { e: "work hours" },
    机种: { e: "product model" },
    上岗: { e: "on duty" },
    人效: { e: "labor efficiency" },
  },
};

async function download(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText} (${url})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function loadSource(url, localPath) {
  if (localPath) {
    console.log(`Reading ${localPath}...`);
    return readFile(resolve(localPath));
  }
  return download(url);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function cleanText(value) {
  return (value ?? "").replace(/\\n/g, "\n").trim();
}

function englishShardName(word) {
  const prefix = word.slice(0, 2);
  return /^[a-z]{2}$/.test(prefix) ? prefix : "__";
}

function chineseShardName(word) {
  const firstCodePoint = word.codePointAt(0) ?? 0;
  return (firstCodePoint >> 8).toString(16).padStart(2, "0");
}

function addEnglishEntry(entries, word, entry) {
  const key = word.normalize("NFKC").trim().toLowerCase();
  if (!key || !/^[a-z0-9][a-z0-9.'-]*$/.test(key)) {
    return;
  }
  const current = entries.get(key);
  if (!current || (entry.t?.length ?? 0) > (current.t?.length ?? 0)) {
    entries.set(key, entry);
  }
}

function parseExchange(value) {
  return (value ?? "")
    .split("/")
    .map((part) => part.slice(part.indexOf(":") + 1).trim())
    .filter((part) => part && !part.includes(":"));
}

function parseEcdict(buffer) {
  const text = buffer.toString("utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift() ?? "").map((header) => header.trim());
  const entries = new Map();
  for (const line of lines) {
    const values = parseCsvLine(line);
    if (values.length < headers.length) {
      continue;
    }
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const word = (row.word ?? "").trim();
    const translation = cleanText(row.translation);
    const definition = cleanText(row.definition);
    const entry = {
      ...(translation ? { t: translation } : {}),
      ...(row.phonetic ? { p: row.phonetic.trim() } : {}),
      ...(definition && definition !== translation ? { d: definition } : {}),
      ...(row.pos ? { o: row.pos.trim() } : {}),
    };
    addEnglishEntry(entries, word, entry);

    for (const variant of parseExchange(row.exchange)) {
      const normalizedVariant = variant.toLowerCase();
      if (/^[a-z0-9][a-z0-9.'-]*$/.test(normalizedVariant) && !entries.has(normalizedVariant)) {
        entries.set(normalizedVariant, { ...entry, h: word });
      }
    }
  }
  return entries;
}

async function mergeLegacyDictionary(entries) {
  if (!LEGACY_DICT_ROOT) {
    return 0;
  }

  let files;
  try {
    files = await readdir(LEGACY_DICT_ROOT);
  } catch {
    return 0;
  }

  let added = 0;
  for (const file of files.filter((name) => /^[a-z]{2}\.json$/i.test(name))) {
    const content = JSON.parse(await readFile(join(LEGACY_DICT_ROOT, file), "utf8"));
    for (const [word, rawEntry] of Object.entries(content)) {
      const key = word.normalize("NFKC").trim().toLowerCase();
      if (!key || !/^[a-z0-9][a-z0-9.'-]*$/.test(key)) {
        continue;
      }

      const entry = typeof rawEntry === "string"
        ? { t: cleanText(rawEntry) }
        : {
            ...(rawEntry?.t ? { t: cleanText(rawEntry.t) } : {}),
            ...(rawEntry?.p ? { p: rawEntry.p.trim() } : {}),
          };
      const current = entries.get(key);
      if (!current) {
        entries.set(key, entry);
        added += 1;
      } else if (!current.t && entry.t) {
        current.t = entry.t;
      }
    }
  }
  return added;
}

function addChineseEntry(entries, word, entry) {
  if (!word) {
    return;
  }
  const current = entries.get(word);
  if (!current) {
    entries.set(word, entry);
    return;
  }

  const translations = new Set([
    ...(current.e ?? "").split("；"),
    ...(entry.e ?? "").split("；"),
  ].filter(Boolean));
  entries.set(word, {
    e: Array.from(translations).join("；"),
    p: current.p || entry.p,
  });
}

function parseCedict(buffer) {
  const text = gunzipSync(buffer).toString("utf8");
  const entries = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^(\S+)\s+(\S+)\s+(\[\[.*\]\]|\[.*\])\s+\/(.*)\/$/);
    if (!match) {
      continue;
    }
    const [, traditional, simplified, rawPinyin, rawGloss] = match;
    const pinyin = rawPinyin.replace(/^\[\[?/, "").replace(/\]\]?$/, "");
    const gloss = rawGloss.split("/").map((part) => part.trim()).filter(Boolean).join("；");
    const entry = { e: gloss, ...(pinyin ? { p: pinyin } : {}) };
    addChineseEntry(entries, simplified, entry);
    addChineseEntry(entries, traditional, entry);
  }
  return entries;
}

function toShards(entries, shardName) {
  const shards = new Map();
  for (const [word, entry] of entries) {
    const name = shardName(word);
    let shard = shards.get(name);
    if (!shard) {
      shard = Object.create(null);
      shards.set(name, shard);
    }
    shard[word] = entry;
  }
  return shards;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

async function writeShards(root, shards) {
  await mkdir(root, { recursive: true });
  for (const [name, shard] of shards) {
    await writeJson(join(root, `${name}.json`), shard);
  }
}

async function main() {
  console.log("Downloading ECDICT...");
  const ecdictBuffer = await loadSource(ECDICT_URL, ECDICT_FILE);
  console.log("Downloading CC-CEDICT...");
  const cedictBuffer = await loadSource(CC_CEDICT_URL, CC_CEDICT_FILE);

  const englishEntries = parseEcdict(ecdictBuffer);
  const legacyEntries = await mergeLegacyDictionary(englishEntries);
  const chineseEntries = parseCedict(cedictBuffer);
  const englishShards = toShards(englishEntries, englishShardName);
  const chineseShards = toShards(chineseEntries, chineseShardName);

  await rm(englishRoot, { recursive: true, force: true });
  await rm(chineseRoot, { recursive: true, force: true });
  await mkdir(dictionaryRoot, { recursive: true });
  await writeShards(englishRoot, englishShards);
  await writeShards(chineseRoot, chineseShards);
  await writeJson(join(dictionaryRoot, "custom.json"), customDictionary);

  const generatedAt = new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    generatedAt,
    sources: {
      legacy: {
        path: LEGACY_DICT_LABEL,
        entries: legacyEntries,
      },
      ecdict: {
        url: ECDICT_URL,
        license: "MIT",
        entries: englishEntries.size,
      },
      ccCedict: {
        url: CC_CEDICT_URL,
        release: CC_CEDICT_RELEASE,
        license: "CC BY-SA 4.0",
        entries: chineseEntries.size,
      },
    },
    english: {
      directory: "en",
      prefixLength: 2,
      entries: englishEntries.size,
      shards: englishShards.size,
    },
    chinese: {
      directory: "zh",
      bucketShift: 8,
      entries: chineseEntries.size,
      shards: chineseShards.size,
    },
  };
  await writeJson(join(dictionaryRoot, "manifest.json"), manifest);

  const sourceNotes = [
    "# Dictionary sources",
    "",
    `Generated at: ${generatedAt}`,
    "",
    "The generated shards are intentionally committed so the extension works without a network connection.",
    "",
    `- Legacy Code Translate processed shards: ${LEGACY_DICT_LABEL}`,
    `  - Compatibility entries added: ${legacyEntries}`,
    "  - The original extension declared the MIT License; this input is used only as a compatibility supplement.",
    `- ECDICT: ${ECDICT_URL}`,
    `  - Entries indexed: ${englishEntries.size}`,
    "  - License: MIT",
    `  - Download SHA-256: ${sha256(ecdictBuffer)}`,
    `- CC-CEDICT: ${CC_CEDICT_URL}`,
    `  - Release used: ${CC_CEDICT_RELEASE}`,
    `  - Entries indexed: ${chineseEntries.size}`,
    "  - License: Creative Commons Attribution-ShareAlike 4.0 International",
    `  - Download SHA-256: ${sha256(cedictBuffer)}`,
    "",
    "See LICENSES.md for attribution and redistribution notes.",
    "",
  ].join("\n");
  await writeFile(join(dictionaryRoot, "SOURCES.md"), sourceNotes, "utf8");

  console.log(`ECDICT plus legacy entries: ${englishEntries.size} in ${englishShards.size} shards (legacy additions: ${legacyEntries})`);
  console.log(`CC-CEDICT entries: ${chineseEntries.size} in ${chineseShards.size} shards`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildHoverMarkdown } from "../src/markdown";

test("renders local, remote, and missing results without external links", () => {
  const markdown = buildHoverMarkdown("getConnection", [
    { term: "get", translation: "获取", phonetic: "ɡet", source: "ecdict" },
    { term: "connection", translation: "连接", source: "google" },
    { term: "unknown", translation: "", source: "none" },
  ]);

  assert.match(markdown, /`get` \/ɡet\/  \n获取/);
  assert.match(markdown, /\*\*\*\*\*/);
  assert.match(markdown, /暂无译文/);
  assert.doesNotMatch(markdown, /本地词库|未找到|Google 在线回退/);
  assert.doesNotMatch(markdown, /https?:\/\//);
});

test("keeps the original one-pass hover layout", () => {
  const markdown = buildHoverMarkdown("SpringApplication", [
    { term: "spring", translation: "春天", phonetic: "/sprɪŋ/", source: "ecdict" },
    { term: "application", translation: "应用", source: "ecdict" },
  ]);

  assert.match(markdown, /`spring` \/sprɪŋ\/  \n春天/);
  assert.match(markdown, /\*\*\*\*\*/);
  assert.match(markdown, /`application`  \n应用/);
  assert.doesNotMatch(markdown, /正在查询本地词库|正在在线翻译|在线翻译失败/);
});

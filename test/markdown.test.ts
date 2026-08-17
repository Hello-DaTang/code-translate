import assert from "node:assert/strict";
import test from "node:test";
import { buildHoverMarkdown } from "../src/markdown";

test("renders local, remote, and missing results without external links", () => {
  const markdown = buildHoverMarkdown("getConnection", [
    { term: "get", translation: "获取", source: "ecdict" },
    { term: "connection", translation: "连接", source: "google" },
    { term: "unknown", translation: "", source: "none" },
  ]);

  assert.match(markdown, /本地词库/);
  assert.match(markdown, /Google 在线回退/);
  assert.match(markdown, /在线翻译也暂时不可用/);
  assert.doesNotMatch(markdown, /https?:\/\//);
});

test("renders local and remote loading states plus the remote error", () => {
  const markdown = buildHoverMarkdown("unknownWord", [
    { term: "unknown", translation: "", source: "none", status: "loading" },
    { term: "word", translation: "", source: "google", status: "loading" },
    { term: "failed", translation: "", source: "google", status: "error", error: "HTTP 403" },
  ]);

  assert.match(markdown, /正在查询本地词库/);
  assert.match(markdown, /正在在线翻译/);
  assert.match(markdown, /在线翻译失败/);
  assert.match(markdown, /HTTP 403/);
});

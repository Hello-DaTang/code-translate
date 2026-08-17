import assert from "node:assert/strict";
import test from "node:test";
import { splitIdentifier, tokenizeForTranslation } from "../src/word-parser";

test("splits camelCase and PascalCase identifiers", () => {
  assert.deepEqual(splitIdentifier("ServiceInstanceListSupplier"), ["service", "instance", "list", "supplier"]);
  assert.deepEqual(splitIdentifier("getConnection"), ["get", "connection"]);
});

test("keeps acronyms as one word", () => {
  assert.deepEqual(splitIdentifier("HTTPServerResponse"), ["http", "server", "response"]);
  assert.deepEqual(splitIdentifier("XMLHttpRequest"), ["xml", "http", "request"]);
});

test("tokenizes separators and Chinese terms", () => {
  assert.deepEqual(tokenizeForTranslation("machine_line-code"), ["machine", "line", "code"]);
  assert.deepEqual(tokenizeForTranslation("设备管理器"), ["设备管理器"]);
});

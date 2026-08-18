import assert from "node:assert/strict";
import test from "node:test";
import { splitIdentifier, tokenizeForTranslation } from "../src/word-parser";

test("splits camelCase and PascalCase identifiers", () => {
  assert.deepEqual(splitIdentifier("ServiceInstanceListSupplier"), ["service", "instance", "list", "supplier"]);
  assert.deepEqual(splitIdentifier("getConnection"), ["get", "connection"]);
});

test("matches the original acronym handling", () => {
  assert.deepEqual(splitIdentifier("HTTPServerResponse"), ["httpserver", "response"]);
  assert.deepEqual(splitIdentifier("XMLHttpRequest"), ["xmlhttp", "request"]);
});

test("tokenizes separators and Chinese terms", () => {
  assert.deepEqual(tokenizeForTranslation("machine_line-code"), ["machine", "line", "code"]);
  assert.deepEqual(tokenizeForTranslation("设备管理器"), ["设备管理器"]);
});

// Run with: node --test src/lib/api-error.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { errorMessage } from "./api-error.ts";

test("prefers the JSON detail string", () => {
  assert.equal(errorMessage(409, "Conflict", { detail: "Already reading a photo." }), "Already reading a photo.");
});

test("reads the message of a Custom module Problem", () => {
  assert.equal(
    errorMessage(502, "Bad Gateway", { detail: { code: "not_found", message: "`state` not found in the response" } }),
    "`state` not found in the response",
  );
});

test("falls back to the status text when there is no usable detail", () => {
  assert.equal(errorMessage(502, "Bad Gateway", undefined), "Bad Gateway");
  assert.equal(errorMessage(422, "Unprocessable", { detail: [{ msg: "x" }] }), "Unprocessable");
});

test("413 with no text says the photo is too large", () => {
  assert.equal(errorMessage(413, "", undefined), "That photo is too large.");
});

test("any other status with no text is never blank", () => {
  assert.equal(errorMessage(500, "", undefined), "Request failed (HTTP 500).");
  assert.equal(errorMessage(500, "", { detail: "" }), "Request failed (HTTP 500).");
});

test("every 413 says the photo is too large, whatever the status text", () => {
  assert.equal(errorMessage(413, "Request Entity Too Large", undefined), "That photo is too large.");
  assert.equal(errorMessage(413, "Content Too Large", "<html>nginx</html>"), "That photo is too large.");
});

test("a 413 with a JSON detail still shows the server's own reason", () => {
  assert.equal(errorMessage(413, "Too Large", { detail: "Photo over 10 MB." }), "Photo over 10 MB.");
});

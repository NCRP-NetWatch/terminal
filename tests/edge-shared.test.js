import test from "node:test";
import assert from "node:assert/strict";
import { escapeDiscordText } from "../supabase/functions/_shared/discord.js";
import { corsHeaders, jsonResponse } from "../supabase/functions/_shared/http.js";

test("Discord escaping neutralizes mentions, markdown, and line breaks", () => {
  assert.equal(escapeDiscordText("@here *alert*\nnext"), "＠here \\*alert\\* next");
});

test("Discord truncation preserves each endpoint's prior policy", () => {
  assert.equal(escapeDiscordText("abcdef", 4), "abcd");
  assert.equal(escapeDiscordText("abcdef", 4, true), "abc…");
});

test("shared JSON responses preserve the requested status and CORS policy", async () => {
  const response = jsonResponse({ sent: true }, 200, corsHeaders);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await response.json(), { sent: true });
});

test("JSON responses remain same-origin unless a handler supplies CORS headers", () => {
  const response = jsonResponse({ error: "Unauthorized" }, 401);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

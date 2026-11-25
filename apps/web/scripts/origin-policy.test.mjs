import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { isSameRequestOrigin } from "../src/lib/origin-policy.ts";

function allowed(url, headers) {
  const request = new NextRequest(url, { method: "POST", headers });
  return isSameRequestOrigin(
    request.headers.get("origin"),
    request.headers.get("host"),
    request.nextUrl.protocol,
  );
}
test("preserves actual IPv4 loopback Host despite Next URL normalization", () => {
  const request = new NextRequest(
    "http://127.0.0.1:4173/api/v1/auth/register",
    { headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" } },
  );
  assert.equal(request.nextUrl.hostname, "localhost");
  assert.equal(
    isSameRequestOrigin(
      request.headers.get("origin"),
      request.headers.get("host"),
      request.nextUrl.protocol,
    ),
    true,
  );
  assert.equal(
    isSameRequestOrigin(
      "http://localhost:4173",
      request.headers.get("host"),
      request.nextUrl.protocol,
    ),
    false,
  );
});
test("permits exact localhost, IPv6, HTTPS and canonical default port origins", () => {
  assert.equal(
    allowed("http://localhost:4173/api/v1/posts", {
      host: "localhost:4173",
      origin: "http://localhost:4173",
    }),
    true,
  );
  assert.equal(
    isSameRequestOrigin("http://[::1]:4173", "[::1]:4173", "http:"),
    true,
  );
  assert.equal(
    isSameRequestOrigin("https://song.example", "song.example", "https:"),
    true,
  );
  assert.equal(
    isSameRequestOrigin("https://song.example", "song.example:443", "https:"),
    true,
  );
});
test("rejects a different origin, protocol, port and spoofed forwarding host", () => {
  assert.equal(
    isSameRequestOrigin("https://evil.example", "song.example", "https:"),
    false,
  );
  assert.equal(
    isSameRequestOrigin("http://song.example", "song.example", "https:"),
    false,
  );
  assert.equal(
    isSameRequestOrigin("http://127.0.0.1:4000", "127.0.0.1:4173", "http:"),
    false,
  );
  assert.equal(
    allowed("https://song.example/api/v1/posts", {
      host: "song.example",
      origin: "https://evil.example",
      "x-forwarded-host": "evil.example",
    }),
    false,
  );
});
test("rejects absent, null, malformed and path-bearing origin or Host values", () => {
  for (const origin of [
    null,
    "null",
    "https://song.example/",
    "https://song.example/path",
    "https://song.example#hash",
    "https://user@song.example",
    "https://song.example, https://evil.example",
  ]) {
    assert.equal(
      isSameRequestOrigin(origin, "song.example", "https:"),
      false,
      String(origin),
    );
  }
  for (const host of [
    null,
    "song.example/",
    "song.example@evil.example",
    "song.example,evil.example",
    "song.example?x=1",
    "song.example\\evil.example",
  ]) {
    assert.equal(
      isSameRequestOrigin("https://song.example", host, "https:"),
      false,
      String(host),
    );
  }
});

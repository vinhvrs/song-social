#!/usr/bin/env python3
"""Exercise the real HTTP API and database on a disposable local instance.

Creates two temporary test accounts and removes their test post. Do not run this
against a production database. Uses only the Python standard library.
"""
from __future__ import annotations

import argparse
from http.cookiejar import CookieJar
import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener
import uuid


class Client:
    def __init__(self, base: str):
        self.base = base.rstrip("/") + "/api/v1"
        parsed = urlparse(base)
        self.origin = f"{parsed.scheme}://{parsed.netloc}"
        self.cookies = CookieJar()
        self.http = build_opener(HTTPCookieProcessor(self.cookies))

    def call(self, method: str, path: str, body=None, *, status=200, csrf=True):
        headers = {"Accept": "application/json"}
        if method not in {"GET", "HEAD"}:
            headers["Origin"] = self.origin
        if method not in {"GET", "HEAD"} and csrf:
            token = self.call("GET", "/auth/csrf")["token"]
            headers["X-XSRF-TOKEN"] = token
        data = None if body is None else json.dumps(body).encode()
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = Request(self.base + path, data=data, headers=headers, method=method)
        try:
            response = self.http.open(request, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            raw = response.read().decode()
            allowed = status if isinstance(status, tuple) else (status,)
            if response.status not in allowed:
                raise AssertionError(f"{method} {path}: expected {allowed}, got {response.status}: {raw[:400]}")
            return json.loads(raw) if raw else None


def run(base: str) -> None:
    if urlparse(base).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise SystemExit("This smoke test is intentionally restricted to a disposable local instance.")
    anonymous, alice, bob = (Client(base) for _ in range(3))
    for attempt in range(90):
        try:
            anonymous.call("GET", "/status")
            break
        except (URLError, AssertionError, TimeoutError):
            if attempt == 89:
                raise
            time.sleep(1)

    checks = 0

    def checked(label: str):
        nonlocal checks
        checks += 1
        print(f"PASS {label}", flush=True)

    assert anonymous.call("GET", "/auth/me") is None
    tracks = anonymous.call("GET", "/tracks")["items"]
    assert tracks and all(len(track["youtubeId"]) == 11 for track in tracks)
    assert isinstance(anonymous.call("GET", "/feed")["items"], list)
    checked("public feed and track catalog")

    suffix = uuid.uuid4().hex[:10]
    alice_info = {"handle": "a_" + suffix, "displayName": "API smoke Alice", "email": f"a_{suffix}@example.test", "password": "Smoke-pass-" + suffix}
    bob_info = {"handle": "b_" + suffix, "displayName": "API smoke Bob", "email": f"b_{suffix}@example.test", "password": "Smoke-pass-" + suffix}
    anonymous.call("POST", "/auth/register", alice_info, status=403, csrf=False)
    checked("CSRF rejects unauthenticated forged registration")
    a = alice.call("POST", "/auth/register", alice_info, status=201)
    b = bob.call("POST", "/auth/register", bob_info, status=201)
    assert alice.call("GET", "/auth/me")["id"] == a["id"]
    assert bob.call("GET", "/auth/me")["id"] == b["id"]
    assert a["id"] != b["id"]
    checked("account creation and isolated cookie sessions")

    anonymous.call("GET", "/feed?tab=following", status=401)
    anonymous.call("POST", "/posts", {"caption": "unauthorized", "trackId": tracks[0]["id"]}, status=401)
    checked("authentication required for writes and personal feed")
    post = alice.call("POST", "/posts", {"caption": "Một bài hát cho buổi chiều. API integration test.", "trackId": tracks[0]["id"]}, status=201)
    assert post["author"]["id"] == a["id"] and post["passage"] is None
    path = "/posts/" + post["id"]
    bob.call("DELETE", path, status=(403, 404))
    checked("post persistence and author-only deletion")

    like1 = bob.call("POST", path + "/like")
    like2 = bob.call("POST", path + "/like")
    assert like1["liked"] and like1["likesCount"] == like2["likesCount"]
    unlike1 = bob.call("DELETE", path + "/like")
    unlike2 = bob.call("DELETE", path + "/like")
    assert not unlike2["liked"] and unlike1["likesCount"] == unlike2["likesCount"] >= 0
    checked("like and unlike are idempotent")

    comment = bob.call("POST", path + "/comments", {"body": "Cảm ơn vì đã chia sẻ."}, status=201)
    assert any(item["id"] == comment["id"] for item in anonymous.call("GET", path + "/comments")["items"])
    bob.call("POST", path + "/comments", {"body": " "}, status=400)
    checked("comments persist and empty input is rejected")

    bob.call("POST", path + "/save", status=204)
    bob.call("POST", path + "/save", status=204)
    assert any(item["id"] == post["id"] for item in bob.call("GET", "/library")["items"])
    assert not any(item["id"] == post["id"] for item in alice.call("GET", "/library")["items"])
    bob.call("DELETE", path + "/save", status=204)
    checked("saved library is private to each account")

    followed = bob.call("POST", "/users/" + a["id"] + "/follow")
    assert followed["following"]
    assert any(item["id"] == post["id"] for item in bob.call("GET", "/feed?tab=following")["items"])
    bob.call("POST", "/users/" + b["id"] + "/follow", status=400)
    unfollowed = bob.call("DELETE", "/users/" + a["id"] + "/follow")
    assert not unfollowed["following"]
    checked("following feed, unfollow, and self-follow protection")

    edited = alice.call("PATCH", "/users/me", {"displayName": "Alice Updated", "bio": "Nhạc và những câu chuyện."})
    assert edited["displayName"] == "Alice Updated"
    assert anonymous.call("GET", "/users/" + a["handle"])["bio"] == "Nhạc và những câu chuyện."
    checked("profile editing persists")

    missing = anonymous.call("GET", "/passages/search?" + urlencode({"q": "Không có đoạn đã duyệt " + suffix}))
    assert missing["items"] == [] and missing["message"]
    alice.call("POST", "/posts", {"caption": "Invalid passage", "trackId": tracks[0]["id"], "passageId": str(uuid.uuid4())}, status=(400, 404))
    checked("no fabricated passage results or untrusted passage attachment")

    alice.call("DELETE", path, status=204)
    assert all(item["id"] != post["id"] for item in anonymous.call("GET", "/users/" + a["handle"] + "/posts")["items"])
    alice.call("POST", "/auth/logout", status=204)
    assert alice.call("GET", "/auth/me") is None
    alice.call("POST", "/auth/login", {"email": alice_info["email"], "password": "incorrect-password"}, status=401)
    alice.call("POST", "/auth/login", {"email": alice_info["email"], "password": alice_info["password"]})
    assert alice.call("GET", "/auth/me")["id"] == a["id"]
    checked("deletion, logout revocation, and password login")
    print(f"PASS: {checks} real HTTP/PostgreSQL scenarios", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    run(parser.parse_args().base_url)

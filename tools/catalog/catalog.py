#!/usr/bin/env python3
"""Validate and append reviewed, recording-specific lyric passages to PostgreSQL.

Standard library only. Structural validation never certifies audible correctness
or legal rights; a human reviewer must check the actual recording and permission.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import unicodedata
from urllib.parse import urlparse
from uuid import UUID

VERSION = 1
MAX_INPUT_BYTES = 5 * 1024 * 1024
MAX_PASSAGES = 1000
MAX_PASSAGE_MS = 90_000
ALLOWED_RIGHTS = {"OWNED", "LICENSED", "PUBLIC_DOMAIN", "CC0", "CC_BY", "CC_BY_SA"}
YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
LANGUAGE = re.compile(r"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")


class CatalogError(ValueError):
    """An actionable validation error; never contains submitted content/secrets."""


def normalize_text(text: str) -> str:
    """NFC, lowercase, whitespace only. Never remove negation or diacritics."""
    return " ".join(unicodedata.normalize("NFC", text).lower().split())


def _error(path: str, message: str) -> None:
    raise CatalogError(f"{path}: {message}")


def _object(value: object, required: set[str], path: str) -> dict:
    if not isinstance(value, dict):
        _error(path, "must be an object")
    if set(value) != required:
        missing, extra = sorted(required - set(value)), sorted(set(value) - required)
        details = []
        if missing:
            details.append("missing keys: " + ", ".join(missing))
        if extra:
            details.append("unknown keys are not allowed")
        _error(path, "; ".join(details))
    return value


def _text(value: object, path: str, maximum: int, *, optional: bool = False) -> str | None:
    if optional and value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        _error(path, "must be a non-empty string")
    if len(value) > maximum:
        _error(path, f"must be at most {maximum} characters")
    # Reject zero-width/invisible controls, bidi overrides, surrogate codepoints,
    # and NUL; retain ordinary line breaks for contiguous multi-line passages.
    if any(unicodedata.category(c) in {"Cc", "Cf", "Cs"} and c not in "\n\r\t" for c in value):
        _error(path, "contains unsupported control or invisible characters")
    return value


def _uuid(value: object, path: str) -> str:
    if not isinstance(value, str):
        _error(path, "must be a canonical UUID string")
    try:
        result = UUID(value)
    except (ValueError, AttributeError):
        _error(path, "must be a canonical UUID string")
    if str(result) != value or result.int == 0:
        _error(path, "must be a non-zero, lowercase canonical UUID")
    return value


def _integer(value: object, path: str, *, optional: bool = False) -> int | None:
    if optional and value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        _error(path, "must be a non-negative integer in milliseconds")
    if value > 86_400_000:
        _error(path, "must be within a recording shorter than 24 hours")
    return value


def _https(value: object, path: str, *, optional: bool = False) -> str | None:
    if optional and value is None:
        return None
    _text(value, path, 2000)
    try:
        parsed = urlparse(value)
        port = parsed.port
    except ValueError:
        _error(path, "must be a valid HTTPS URL")
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or port not in {None, 443} or any(c.isspace() for c in value)):
        _error(path, "must be an HTTPS URL without credentials or a custom port")
    return value


def _review_date(value: object, path: str, now: dt.datetime) -> str:
    _text(value, path, 64)
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        _error(path, "must be an ISO-8601 timestamp with a timezone")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        _error(path, "must include a timezone")
    if parsed > now + dt.timedelta(minutes=5):
        _error(path, "cannot be in the future")
    return value


def validate_catalog(data: object, *, allow_drafts: bool = False,
                     now: dt.datetime | None = None) -> list[dict]:
    """Return validated records; default rejects every unreviewed record."""
    now = now or dt.datetime.now(dt.timezone.utc)
    root = _object(data, {"schemaVersion", "passages"}, "catalog")
    if type(root["schemaVersion"]) is not int or root["schemaVersion"] != VERSION:
        _error("catalog.schemaVersion", "must be 1")
    records = root["passages"]
    if not isinstance(records, list) or len(records) > MAX_PASSAGES:
        _error("catalog.passages", f"must be an array of at most {MAX_PASSAGES} passages")
    ids: set[str] = set()
    intervals: set[tuple] = set()
    recordings: dict[str, str] = {}
    for index, value in enumerate(records):
        path = f"passages[{index}]"
        item = _object(value, {"id", "trackId", "text", "language", "startMs", "endMs",
                               "verification", "recording", "rights", "review"}, path)
        passage_id = _uuid(item["id"], path + ".id")
        track_id = _uuid(item["trackId"], path + ".trackId")
        if passage_id in ids:
            _error(path + ".id", "duplicate passage ID")
        ids.add(passage_id)
        text = _text(item["text"], path + ".text", 2000)
        if len(normalize_text(text)) > 2000:
            _error(path + ".text", "normalized text exceeds 2000 characters")
        language = _text(item["language"], path + ".language", 16)
        if not LANGUAGE.fullmatch(language):
            _error(path + ".language", "must be a language tag such as vi or en")
        reviewed = item["verification"] == "REVIEWED"
        if not isinstance(item["verification"], str) or item["verification"] not in {"DRAFT", "REVIEWED"}:
            _error(path + ".verification", "must be DRAFT or REVIEWED")
        if not reviewed and not allow_drafts:
            _error(path + ".verification", "DRAFT cannot be exported/imported; review the recording first")
        start = _integer(item["startMs"], path + ".startMs", optional=not reviewed)
        end = _integer(item["endMs"], path + ".endMs", optional=not reviewed)
        if (start is None) != (end is None):
            _error(path, "startMs and endMs must both be present or both null")
        if start is not None:
            if end <= start:
                _error(path + ".endMs", "must be greater than startMs")
            if end - start > MAX_PASSAGE_MS:
                _error(path, "a contiguous passage must be no longer than 90 seconds")
            interval = (track_id, start, end)
            if interval in intervals:
                _error(path, "duplicate interval for the same track")
            intervals.add(interval)
        recording = _object(item["recording"], {"provider", "youtubeId", "sourceUrl", "lyricsSourceUrl", "durationMs"}, path + ".recording")
        if recording["provider"] != "YOUTUBE":
            _error(path + ".recording.provider", "v1 supports YOUTUBE recordings only")
        video_id = _text(recording["youtubeId"], path + ".recording.youtubeId", 11, optional=not reviewed)
        if video_id is not None and not YOUTUBE_ID.fullmatch(video_id):
            _error(path + ".recording.youtubeId", "must be an 11-character YouTube video ID")
        source = _https(recording["sourceUrl"], path + ".recording.sourceUrl", optional=not reviewed)
        _https(recording["lyricsSourceUrl"], path + ".recording.lyricsSourceUrl", optional=not reviewed)
        if source is not None:
            parsed = urlparse(source)
            if (parsed.hostname not in {"www.youtube.com", "youtube.com"}
                    or parsed.path != "/watch" or parsed.fragment
                    or parsed.query != "v=" + str(video_id)):
                _error(path + ".recording.sourceUrl", "must be https://www.youtube.com/watch?v=<youtubeId> for this recording")
        duration = _integer(recording["durationMs"], path + ".recording.durationMs", optional=not reviewed)
        if duration is not None and (duration == 0 or (end is not None and end > duration)):
            _error(path + ".recording.durationMs", "must be positive and include the entire passage")
        if video_id is not None:
            if track_id in recordings and recordings[track_id] != video_id:
                _error(path + ".recording.youtubeId", "one track ID cannot identify multiple recordings")
            recordings[track_id] = video_id
        rights = _object(item["rights"], {"basis", "referenceUrl", "attribution"}, path + ".rights")
        basis = _text(rights["basis"], path + ".rights.basis", 100, optional=not reviewed)
        if basis is not None and basis not in ALLOWED_RIGHTS:
            _error(path + ".rights.basis", "must name a supported explicit rights basis")
        _https(rights["referenceUrl"], path + ".rights.referenceUrl", optional=not reviewed)
        _text(rights["attribution"], path + ".rights.attribution", 1500, optional=not reviewed)
        review = _object(item["review"], {"reviewer", "reviewedAt", "textMatchesRecording", "boundariesChecked", "playbackChecked"}, path + ".review")
        _text(review["reviewer"], path + ".review.reviewer", 120, optional=not reviewed)
        if reviewed or review["reviewedAt"] is not None:
            _review_date(review["reviewedAt"], path + ".review.reviewedAt", now)
        for flag in ("textMatchesRecording", "boundariesChecked", "playbackChecked"):
            if type(review[flag]) is not bool:
                _error(path + ".review." + flag, "must be a boolean")
            if reviewed and review[flag] is not True:
                _error(path + ".review." + flag, "must be explicitly true for a reviewed passage")
    return records


def _unique_keys(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise CatalogError("JSON contains a duplicate object key")
        result[key] = value
    return result


def load_catalog(path: Path) -> dict:
    try:
        with path.open("rb") as stream:
            raw = stream.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            raise CatalogError("Catalog file exceeds 5 MiB")
        return json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_keys,
                          parse_constant=lambda _: (_ for _ in ()).throw(CatalogError("Non-finite numbers are not valid JSON")))
    except CatalogError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CatalogError("Cannot read catalog as valid UTF-8 JSON") from exc


def _sql_string(value: str) -> str:
    """PostgreSQL E-string with explicit escaping independent of server defaults."""
    return "E'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def build_sql(data: object) -> str:
    """Append-only, all-or-nothing import; existing IDs fail rather than mutate."""
    records = validate_catalog(data)
    lines = ["-- Generated by Song Social catalog v1; review and keep the source JSON.",
             "-- No UPDATE/DELETE/UPSERT: published passages must remain immutable.",
             "BEGIN;", "SET LOCAL lock_timeout = '5s';", "SET LOCAL statement_timeout = '30s';",
             "LOCK TABLE music_tracks IN SHARE MODE;"]
    for item in records:
        # Only validated UUIDs and URL-safe 11-character IDs enter the DO block;
        # arbitrary lyric/provenance strings appear only as escaped E-literals.
        lines += ["DO $song_social_catalog$", "BEGIN",
                  "  IF NOT EXISTS (SELECT 1 FROM music_tracks WHERE id = '" + item["trackId"] + "'::uuid AND youtube_id = '" + item["recording"]["youtubeId"] + "') THEN",
                  "    RAISE EXCEPTION 'Catalog track/recording mismatch for track " + item["trackId"] + "';",
                  "  END IF;", "END;", "$song_social_catalog$;"]
        evidence = json.dumps({"permissionReference": item["rights"]["referenceUrl"],
                               "attribution": item["rights"]["attribution"],
                               "lyricsSource": item["recording"]["lyricsSourceUrl"],
                               "recordingDurationMs": item["recording"]["durationMs"],
                               "review": item["review"]}, ensure_ascii=False, separators=(",", ":"))
        values = [f"'{item['id']}'::uuid", f"'{item['trackId']}'::uuid", _sql_string(item["text"]),
                  _sql_string(normalize_text(item["text"])), _sql_string(item["language"]),
                  str(item["startMs"]), str(item["endMs"]), "'REVIEWED'",
                  _sql_string(item["recording"]["sourceUrl"]), _sql_string(item["rights"]["basis"]),
                  _sql_string(evidence), _sql_string(item["review"]["reviewer"]),
                  _sql_string(item["review"]["reviewedAt"]) + "::timestamptz", "TRUE"]
        lines += ["INSERT INTO lyric_passages (id, track_id, text, normalized_text, language, start_ms, end_ms, verification, source_url, rights_basis, rights_reference, reviewer, reviewed_at, recording_checked)",
                  "VALUES (" + ", ".join(values) + ");"]
    lines += ["COMMIT;", ""]
    return "\n".join(lines)


def import_catalog(data: object) -> int:
    """Use standard PG* environment/pg_service.conf; never receive/log a DSN."""
    sql = build_sql(data)
    psql = shutil.which("psql")
    if psql is None:
        raise CatalogError("psql is required for import; use build-sql for an offline export")
    if not data["passages"]:
        return 0
    env = os.environ.copy()
    env.setdefault("PGCONNECT_TIMEOUT", "10")
    env["PGAPPNAME"] = "song-social-catalog"
    try:
        result = subprocess.run([psql, "--no-psqlrc", "--no-password", "--quiet", "--set=ON_ERROR_STOP=1"],
                                input=sql, text=True, capture_output=True, env=env, timeout=90,
                                check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise CatalogError("Database import could not complete; no credentials or server diagnostics were printed") from exc
    if result.returncode:
        # PostgreSQL diagnostics may contain submitted lyrics, connection details,
        # or SQL. Do not echo them into CI/build logs. ON_ERROR_STOP and a single
        # transaction prevent partial imports; inspect DB logs privately if needed.
        raise CatalogError("Database import did not report success. Check connection/schema, existing IDs and track/recording mappings privately before retrying")
    return len(data["passages"])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("validate", help="Validate review, timing and provenance requirements")
    check.add_argument("catalog", type=Path)
    check.add_argument("--allow-drafts", action="store_true", help="Check drafts; does NOT make them importable")
    export = sub.add_parser("build-sql", help="Export append-only PostgreSQL SQL from reviewed entries")
    export.add_argument("catalog", type=Path)
    export.add_argument("--output", type=Path, required=True)
    canonical = sub.add_parser("export-json", help="Write a canonical reviewed catalog without changing lyric text")
    canonical.add_argument("catalog", type=Path)
    canonical.add_argument("--output", type=Path, required=True)
    db = sub.add_parser("import", help="Import reviewed entries using psql and inherited PG* environment")
    db.add_argument("catalog", type=Path)
    args = parser.parse_args(argv)
    try:
        data = load_catalog(args.catalog)
        if args.command == "validate":
            records = validate_catalog(data, allow_drafts=args.allow_drafts)
            reviewed = sum(p["verification"] == "REVIEWED" for p in records)
            print(f"Valid structure: {len(records)} passages ({reviewed} reviewed, {len(records)-reviewed} drafts).")
            print("This checks recorded attestations, not audible correctness or permission validity.")
        elif args.command == "build-sql":
            sql = build_sql(data)
            # Never overwrite an existing SQL artifact silently.
            with args.output.open("x", encoding="utf-8") as output:
                output.write(sql)
            print(f"Wrote append-only SQL for {len(data['passages'])} reviewed passages.")
        elif args.command == "export-json":
            records = validate_catalog(data)
            with args.output.open("x", encoding="utf-8") as output:
                json.dump({"schemaVersion": VERSION, "passages": records}, output, ensure_ascii=False, indent=2)
                output.write("\n")
            print(f"Wrote canonical JSON for {len(records)} reviewed passages; original lyric text preserved.")
        elif args.command == "import":
            count = import_catalog(data)
            print(f"Imported {count} reviewed passages.")
    except (CatalogError, OSError) as exc:
        if isinstance(exc, CatalogError):
            print("ERROR: " + str(exc), file=sys.stderr)
        else:
            print("ERROR: Could not create output; use a new writable destination.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Fixtures below are fictional test data, NOT a publishable reviewed catalog."""
import copy
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import datetime as dt
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("catalog", ROOT / "catalog.py")
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)
NOW = dt.datetime(2026, 11, 25, tzinfo=dt.timezone.utc)


def fixture():
    """Never imported outside mocked tests; no recording was actually reviewed."""
    return {"schemaVersion": 1, "passages": [{
        "id": "aaa6d16a-ea8d-4eb3-a2e9-e0c591b6b41e",
        "trackId": "bbb08cd9-47c8-43c2-843d-33225ae3c88c",
        "text": "Tôi giữ lại một câu tự viết.",
        "language": "vi", "startMs": 1000, "endMs": 6000,
        "verification": "REVIEWED",
        "recording": {"provider": "YOUTUBE", "youtubeId": "TEST_ONLY_1",
                      "sourceUrl": "https://www.youtube.com/watch?v=TEST_ONLY_1",
                      "lyricsSourceUrl": "https://example.test/fictional-lyrics",
                      "durationMs": 60_000},
        "rights": {"basis": "OWNED", "referenceUrl": "https://example.test/fictional-permission",
                   "attribution": "Fictional test fixture; no real-world review or rights claim"},
        "review": {"reviewer": "Fictional unit-test reviewer", "reviewedAt": "2026-01-01T00:00:00Z",
                   "textMatchesRecording": True, "boundariesChecked": True, "playbackChecked": True}
    }]}


class ValidationTests(unittest.TestCase):
    def rejects(self, mutate, expected):
        data = fixture()
        mutate(data["passages"][0])
        with self.assertRaisesRegex(catalog.CatalogError, expected):
            catalog.validate_catalog(data, now=NOW)

    def test_empty_production_catalog_valid(self):
        data = catalog.load_catalog(ROOT / "catalog.empty.json")
        self.assertEqual(catalog.validate_catalog(data), [])

    def test_structurally_complete_fixture(self):
        self.assertEqual(len(catalog.validate_catalog(fixture(), now=NOW)), 1)

    def test_draft_valid_for_editing_but_cannot_export(self):
        draft = catalog.load_catalog(ROOT / "examples" / "draft.json")
        self.assertEqual(len(catalog.validate_catalog(draft, allow_drafts=True)), 1)
        with self.assertRaisesRegex(catalog.CatalogError, "DRAFT cannot"):
            catalog.build_sql(draft)

    def test_missing_rights_reference_rejected(self):
        self.rejects(lambda p: p["rights"].update(referenceUrl=None), "referenceUrl")

    def test_missing_attribution_rejected(self):
        self.rejects(lambda p: p["rights"].update(attribution=""), "attribution")

    def test_unreviewed_check_cannot_be_bypassed(self):
        for flag in ("textMatchesRecording", "boundariesChecked", "playbackChecked"):
            with self.subTest(flag=flag):
                self.rejects(lambda p: p["review"].update({flag: False}), flag)

    def test_string_true_not_a_review_boolean(self):
        self.rejects(lambda p: p["review"].update(playbackChecked="true"), "boolean")

    def test_reviews_require_timezone_and_cannot_be_future(self):
        self.rejects(lambda p: p["review"].update(reviewedAt="2026-01-01T00:00:00"), "timezone")
        self.rejects(lambda p: p["review"].update(reviewedAt="2036-01-01T00:00:00Z"), "future")

    def test_bad_intervals(self):
        for patch_value in ({"startMs": -1}, {"endMs": 1000}, {"endMs": 999},
                            {"endMs": 100001}, {"startMs": True}, {"endMs": 1.5}):
            with self.subTest(patch_value=patch_value):
                self.rejects(lambda p: p.update(patch_value), "must|passage")

    def test_bounds_within_actual_recording(self):
        self.rejects(lambda p: p["recording"].update(durationMs=5000), "durationMs")

    def test_source_must_identify_same_recording(self):
        self.rejects(lambda p: p["recording"].update(sourceUrl="https://www.youtube.com/watch?v=OTHER_ONLY1"), "this recording")
        self.rejects(lambda p: p["recording"].update(sourceUrl="https://www.youtube.com/watch?v=TEST_ONLY_1&t=1"), "this recording")

    def test_credentials_in_source_url_not_allowed(self):
        self.rejects(lambda p: p["rights"].update(referenceUrl="https://secret:token@example.test/rights"), "without credentials")

    def test_duplicate_ids(self):
        data = fixture()
        data["passages"].append(copy.deepcopy(data["passages"][0]))
        with self.assertRaisesRegex(catalog.CatalogError, "duplicate passage ID"):
            catalog.validate_catalog(data, now=NOW)

    def test_duplicate_intervals(self):
        data = fixture()
        second = copy.deepcopy(data["passages"][0])
        second["id"] = "ccc6d16a-ea8d-4eb3-a2e9-e0c591b6b41e"
        data["passages"].append(second)
        with self.assertRaisesRegex(catalog.CatalogError, "duplicate interval"):
            catalog.validate_catalog(data, now=NOW)

    def test_single_track_cannot_point_to_two_recordings(self):
        data = fixture()
        second = copy.deepcopy(data["passages"][0])
        second.update(id="ccc6d16a-ea8d-4eb3-a2e9-e0c591b6b41e", startMs=7000, endMs=9000)
        second["recording"].update(youtubeId="TEST_ONLY_2", sourceUrl="https://www.youtube.com/watch?v=TEST_ONLY_2")
        data["passages"].append(second)
        with self.assertRaisesRegex(catalog.CatalogError, "multiple recordings"):
            catalog.validate_catalog(data, now=NOW)

    def test_unknown_fields_and_invalid_types_rejected(self):
        self.rejects(lambda p: p.update(isVerifiedByAI=True), "unknown keys")
        self.rejects(lambda p: p.update(verification=[]), "DRAFT or REVIEWED")
        self.rejects(lambda p: p.update(text="ok\x00bad"), "control")
        self.rejects(lambda p: p.update(text="ok\u202e hidden"), "control")

    def test_duplicate_json_keys_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.json"
            path.write_text('{"schemaVersion":1,"schemaVersion":2,"passages":[]}', encoding="utf-8")
            with self.assertRaisesRegex(catalog.CatalogError, "duplicate"):
                catalog.load_catalog(path)

    def test_invalid_json_and_nan_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.json"
            for value in ('not json', '{"schemaVersion":NaN,"passages":[]}'):
                path.write_text(value, encoding="utf-8")
                with self.assertRaises(catalog.CatalogError):
                    catalog.load_catalog(path)


class MatchingSafetyTests(unittest.TestCase):
    def test_nfc_case_and_whitespace_normalized(self):
        self.assertEqual(catalog.normalize_text("  ANH  nhớ\nEM  "), "anh nhớ em")
        self.assertEqual(catalog.normalize_text("To\u0302i kho\u0302ng ye\u0302u ba\u0323n"), "tôi không yêu bạn")
        self.assertEqual(catalog.normalize_text("Anh\u00a0nhớ\u2003em"), "anh nhớ em")

    def test_meaning_bearing_words_and_marks_remain(self):
        pairs = [("I love you", "I don't love you"), ("anh nhớ em", "em nhớ anh"),
                 ("tôi đã yêu bạn", "tôi sẽ yêu bạn"), ("nho", "nhớ"),
                 ("love you", "love you!"), ("I love you", "I love you, but goodbye")]
        for a, b in pairs:
            with self.subTest(a=a, b=b):
                self.assertNotEqual(catalog.normalize_text(a), catalog.normalize_text(b))


class SqlTests(unittest.TestCase):
    def test_sql_atomic_append_only_and_checks_recording(self):
        sql = catalog.build_sql(fixture())
        self.assertIn("BEGIN;", sql)
        self.assertTrue(sql.endswith("COMMIT;\n"))
        self.assertIn("LOCK TABLE music_tracks IN SHARE MODE;", sql)
        self.assertIn("AND youtube_id = 'TEST_ONLY_1'", sql)
        self.assertIn("RAISE EXCEPTION 'Catalog track/recording mismatch", sql)
        self.assertIn("INSERT INTO lyric_passages", sql)
        self.assertNotIn("ON CONFLICT", sql)
        self.assertNotIn("UPDATE lyric_passages", sql)
        self.assertNotIn("DELETE FROM", sql)

    def test_hostile_lyrics_are_one_escaped_postgres_string(self):
        data = fixture()
        value = "a'); DROP TABLE users; --\\ x $$ $song_social_catalog$"
        data["passages"][0]["text"] = value
        sql = catalog.build_sql(data)
        literal = catalog._sql_string(value)
        self.assertIn(literal, sql)
        self.assertEqual(literal, "E'a''); DROP TABLE users; --\\\\ x $$ $song_social_catalog$'")
        # Decode PostgreSQL's E-string content independently; no raw closing quote
        # remains before the final delimiter.
        inner, decoded, i = literal[2:-1], [], 0
        while i < len(inner):
            if inner[i] == "'":
                self.assertEqual(inner[i:i+2], "''")
                decoded.append("'")
                i += 2
            elif inner[i] == "\\":
                self.assertEqual(inner[i:i+2], "\\\\")
                decoded.append("\\")
                i += 2
            else:
                decoded.append(inner[i])
                i += 1
        self.assertEqual("".join(decoded), value)

    def test_import_failure_does_not_echo_db_diagnostics_or_secret(self):
        result = subprocess.CompletedProcess([], 1, stdout="", stderr="secret-password sensitive-lyrics")
        with patch.object(catalog.shutil, "which", return_value="/usr/bin/psql"), patch.object(catalog.subprocess, "run", return_value=result) as run:
            with self.assertRaises(catalog.CatalogError) as error:
                catalog.import_catalog(fixture())
            self.assertNotIn("secret-password", str(error.exception))
            self.assertNotIn("sensitive-lyrics", str(error.exception))
            command = run.call_args.args[0]
            self.assertEqual(command, ["/usr/bin/psql", "--no-psqlrc", "--no-password", "--quiet", "--set=ON_ERROR_STOP=1"])
            self.assertNotIn("postgres://", " ".join(command))

    def test_import_success_returns_count(self):
        result = subprocess.CompletedProcess([], 0, stdout="", stderr="")
        with patch.object(catalog.shutil, "which", return_value="/usr/bin/psql"), patch.object(catalog.subprocess, "run", return_value=result):
            self.assertEqual(catalog.import_catalog(fixture()), 1)

    def test_canonical_export_preserves_original_unicode_lyrics(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.json", Path(directory) / "output.json"
            data = fixture()
            data["passages"][0]["text"] = "  To\u0302i giữ lại một câu tự viết.  "
            source.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            with redirect_stdout(StringIO()):
                result = catalog.main(["export-json", str(source), "--output", str(output)])
            self.assertEqual(result, 0)
            self.assertEqual(json.loads(output.read_text()), data)

    def test_export_will_not_overwrite_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "existing.sql"
            path.write_text("do not replace", encoding="utf-8")
            with redirect_stderr(StringIO()):
                self.assertEqual(catalog.main(["build-sql", str(ROOT / "catalog.empty.json"), "--output", str(path)]), 2)
            self.assertEqual(path.read_text(), "do not replace")


if __name__ == "__main__":
    unittest.main()

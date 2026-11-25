#!/usr/bin/env python3
"""Optional PostgreSQL smoke test against an explicitly disposable migrated DB.

Requires psycopg 3, supplied separately from the stdlib-only catalog tool.
All fixture tables are temporary shadows of the real schema, and EVERY fixture
transaction rolls back. No synthetic reviewed passage enters public tables.
"""
from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from test_catalog import catalog, fixture  # fictional fixture, never real reviewed music


def body_of_generated_transaction(data: dict) -> str:
    """Keep actual generated statements, but own BEGIN/ROLLBACK in the test."""
    lines = catalog.build_sql(data).splitlines()
    assert lines[-1] == "COMMIT;", "Unexpected SQL transaction footer"
    del lines[-1]
    lines.remove("BEGIN;")
    return "\n".join(lines)


def seed_temporary_track(connection, *, video_id: str = "TEST_ONLY_1") -> None:
    connection.execute(
        "INSERT INTO pg_temp.music_tracks (id,title,artist,youtube_id,genre,color) VALUES (%s,%s,%s,%s,%s,%s)",
        (fixture()["passages"][0]["trackId"], "Fictional database test", "Test fixture", video_id, "Test", "#112233"),
    )


def rollback_assertion(connection, action) -> None:
    connection.execute("BEGIN")
    try:
        action()
    finally:
        # Also recovers an aborted transaction after the expected failing import.
        connection.execute("ROLLBACK")
    assert connection.execute("SELECT count(*) FROM pg_temp.lyric_passages").fetchone()[0] == 0
    assert connection.execute("SELECT count(*) FROM pg_temp.music_tracks").fetchone()[0] == 0


def run(connection, psycopg) -> int:
    before = connection.execute("SELECT count(*) FROM public.lyric_passages").fetchone()[0]
    # Shadow actual migrated schema on this connection. LIKE includes columns,
    # defaults, indexes and CHECKs; FK is added explicitly because LIKE omits FKs.
    connection.execute("CREATE TEMP TABLE music_tracks (LIKE public.music_tracks INCLUDING ALL) ON COMMIT PRESERVE ROWS")
    connection.execute("CREATE TEMP TABLE lyric_passages (LIKE public.lyric_passages INCLUDING ALL) ON COMMIT PRESERVE ROWS")
    connection.execute("ALTER TABLE pg_temp.lyric_passages ADD CONSTRAINT test_track_fk FOREIGN KEY (track_id) REFERENCES pg_temp.music_tracks(id)")
    connection.execute("CREATE TEMP TABLE import_sentinel (value text) ON COMMIT PRESERVE ROWS")
    connection.execute("SET search_path TO pg_temp, public")

    def roundtrip():
        seed_temporary_track(connection)
        connection.execute("INSERT INTO pg_temp.import_sentinel VALUES ('still here')")
        data = fixture()
        hostile_text = "I don't love you'); DROP TABLE import_sentinel; --\\\nTiếng Việt $$ $song_social_catalog$"
        data["passages"][0]["text"] = hostile_text
        connection.execute(body_of_generated_transaction(data), prepare=False)
        row = connection.execute("SELECT text, normalized_text, rights_reference FROM pg_temp.lyric_passages").fetchone()
        assert row[0] == hostile_text, "SQL did not preserve submitted text"
        assert row[1] == catalog.normalize_text(hostile_text), "SQL normalization diverged"
        assert json.loads(row[2])["review"]["playbackChecked"] is True
        assert connection.execute("SELECT value FROM pg_temp.import_sentinel").fetchone()[0] == "still here"

    rollback_assertion(connection, roundtrip)
    print("PASS: actual SQL syntax, Unicode/quote/backslash roundtrip, provenance and injection resistance")

    def recording_mismatch():
        seed_temporary_track(connection, video_id="TEST_ONLY_2")
        try:
            connection.execute(body_of_generated_transaction(fixture()), prepare=False)
        except psycopg.errors.RaiseException:
            return
        raise AssertionError("Recording mismatch was incorrectly accepted")

    rollback_assertion(connection, recording_mismatch)
    print("PASS: database track/video identity mismatch rejects the import")

    def duplicate_existing_id():
        seed_temporary_track(connection)
        sql = body_of_generated_transaction(fixture())
        connection.execute(sql, prepare=False)
        try:
            connection.execute(sql, prepare=False)
        except psycopg.errors.UniqueViolation:
            return
        raise AssertionError("Existing passage was silently overwritten or accepted")

    rollback_assertion(connection, duplicate_existing_id)
    print("PASS: existing passage IDs cannot be overwritten; all fixture rows rolled back")

    def failed_second_row():
        seed_temporary_track(connection)
        data = fixture()
        second = copy.deepcopy(data["passages"][0])
        second.update(id="ccc6d16a-ea8d-4eb3-a2e9-e0c591b6b41e", trackId="ddd08cd9-47c8-43c2-843d-33225ae3c88c")
        data["passages"].append(second)
        try:
            connection.execute(body_of_generated_transaction(data), prepare=False)
        except psycopg.errors.RaiseException:
            return
        raise AssertionError("Missing second track was incorrectly accepted")

    rollback_assertion(connection, failed_second_row)
    print("PASS: a later failing passage rolls back the earlier inserted passage")
    after = connection.execute("SELECT count(*) FROM public.lyric_passages").fetchone()[0]
    assert after == before, "Persistent catalog row count changed during isolated test"
    print("PASS: persistent reviewed catalog unchanged; every synthetic row stayed in temporary tables")
    return 5


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--disposable-database", action="store_true",
                        help="Confirm PG* settings identify a disposable test database, never production")
    args = parser.parse_args()
    if not args.disposable_database:
        parser.error("Use --disposable-database only after selecting the disposable DB with PG* settings")
    try:
        import psycopg
    except ImportError:
        print("ERROR: install psycopg 3 in a test environment first", file=sys.stderr)
        return 2
    try:
        # Empty DSN delegates credentials to normal PG* / service configuration.
        with psycopg.connect("", autocommit=True, connect_timeout=10, application_name="song-social-catalog-test") as connection:
            checks = run(connection, psycopg)
        print(f"PostgreSQL catalog smoke: {checks} checks passed.")
    except Exception as error:
        # Do not echo connection strings or SQL/lyric diagnostics.
        print(f"ERROR: catalog integration test failed ({type(error).__name__}); inspect the disposable database privately", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

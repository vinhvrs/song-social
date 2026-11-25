# Reviewed lyric catalog

Song Social searches **actual sung words attached to one specific recording**. The initial production catalog is deliberately empty. A matching song title, mood, generated lyric, remembered lyric, or timestamp guessed by an AI is not a verified passage.

The Python tool is offline and uses only the standard library (Python 3.11+). It validates review attestations and data consistency. It does not listen to audio, discover permission automatically, or certify that a reviewer is correct.

## Files

- `tools/catalog/catalog.py`: validator, canonical JSON export, append-only SQL export and database importer.
- `tools/catalog/schema.json`: JSON Schema for editor validation. Run the Python validator as well; JSON Schema cannot check all relationships between fields.
- `tools/catalog/catalog.empty.json`: initial production catalog, with zero reviewed passages.
- `tools/catalog/examples/draft.json`: original fictional wording to demonstrate draft structure. It has no real recording, timestamps, permission claim or completed review, and cannot be exported/imported.
- `tools/catalog/tests/`: isolated synthetic fixtures. Their `REVIEWED` fields exercise the validator only; they are not real reviewed songs and must never be loaded as a catalog.

## Review a passage

1. Register the track in `music_tracks` with its exact YouTube video ID. An album version, live performance, cover and lyric video are different recordings, even if they share a title. The importer checks the track ID/video ID pair against the database.
2. Establish the rights basis for the lyric text and intended use. Record a non-secret HTTPS reference and the required attribution. Public availability of a video does not itself establish permission to redistribute lyrics. Keep any private permission evidence securely outside this public repository, and use a reference that can be reviewed by the owner.
3. Listen to that recording and transcribe the actual contiguous words. Preserve pronouns, negation and tense. Do not substitute a paraphrase or another recording's lyrics. Include the lyric-source reference; for an original song this can be the owner's published transcription.
4. Measure `startMs` and `endMs` against that same recording. The start is inclusive and the end is exclusive. Use one contiguous passage, no longer than 90 seconds, within the measured recording duration. No splicing words together is performed.
5. Preview through the actual visible player. Confirm that the selected words are audible in full and that adjacent words do not change the meaning. Recheck pause/end behavior. YouTube seeks are not a guarantee of sample-accurate or word-accurate boundaries; if playback cannot reliably express the intended passage, leave it as a draft.
6. Have the reviewer record their name/identifier, timezone-aware review time, and the three independent checks: actual text, passage boundaries, and actual preview playback. Set `verification` to `REVIEWED` only after all three are true and the rights references are complete.
7. Validate, keep the reviewed JSON as the source record, and import it into the intended database. Do not commit private evidence, credentials, or signed URLs to the public repository.

This review process is what establishes audible correctness. An entry passing a JSON schema is only structurally ready.

## Commands

Run from the repository root:

```sh
# The empty initial production catalog is valid.
python tools/catalog/catalog.py validate tools/catalog/catalog.empty.json

# Draft editing is allowed, but this flag is not available for export/import.
python tools/catalog/catalog.py validate tools/catalog/examples/draft.json --allow-drafts

# A real reviewed catalog is supplied by the owner after listening and review.
python tools/catalog/catalog.py validate /path/to/reviewed.json
python tools/catalog/catalog.py export-json /path/to/reviewed.json --output /path/to/catalog-reviewed.json
python tools/catalog/catalog.py build-sql /path/to/reviewed.json --output /path/to/catalog-import.sql

# Uses psql connection settings already configured in PG* / pg_service.conf.
# No database URL/password is accepted as a CLI argument or printed in logs.
PGSERVICE=song_social python tools/catalog/catalog.py import /path/to/reviewed.json

python -m unittest discover -s tools/catalog/tests -v
```

### Optional PostgreSQL integration smoke

The stdlib unit suite does not require PostgreSQL. To exercise actual generated SQL, install `psycopg` 3 in a test environment and select an already-migrated **disposable** database:

```sh
PGSERVICE=song_social_test python tools/catalog/tests/integration_sql.py --disposable-database
```

This explicitly opted-in smoke test creates connection-local temporary tables with the same schema as the migrated tables. It checks SQL syntax, hostile-text escaping, Unicode roundtrip, recording mismatches, immutable passage IDs and rollback of a later failing row. Every synthetic fixture transaction rolls back; no fixture passage enters the persistent catalog. It is separate from normal unit-test discovery.

The export commands refuse to overwrite an existing file. An import requires `psql` and an already-migrated backend database. Connection settings must select that database; the tool does not create a database or store credentials. Database diagnostics are intentionally not echoed because they may contain submitted text or connection details. If import does not report success, inspect the database privately before retrying.

## Data contract

Each document contains `schemaVersion: 1` and a `passages` array. Each passage has:

| Field | Meaning |
| --- | --- |
| `id` | New canonical UUID for this immutable passage. |
| `trackId` | Existing `music_tracks.id` for the exact recording. |
| `text` | Actual audible words, at most 2,000 characters. |
| `language` | Language of the sung words, such as `vi` or `en`; at most 16 characters. |
| `startMs`, `endMs` | Integer millisecond boundaries; `0 <= startMs < endMs <= durationMs`. |
| `verification` | `DRAFT` or `REVIEWED`. Only `REVIEWED` entries can export/import. |
| `recording` | Provider (`YOUTUBE`), exact 11-character `youtubeId`, canonical watch `sourceUrl`, `lyricsSourceUrl`, and measured `durationMs`. |
| `rights` | Explicit `basis`, non-secret `referenceUrl`, and `attribution`. |
| `review` | `reviewer`, timezone-aware `reviewedAt`, and three explicit boolean listening/playback checks. |

Supported declared rights bases are `OWNED`, `LICENSED`, `PUBLIC_DOMAIN`, `CC0`, `CC_BY` and `CC_BY_SA`. The validator does not decide whether a claim is valid or whether the required attribution satisfies the applicable permission. Record the basis that actually applies to the lyric text and intended use.

Drafts may use `null` for unfinished recording, timing, rights and review fields. Unknown fields, duplicate IDs, duplicate intervals, inconsistent recording IDs, invisible control characters, negative/invalid times, future review dates and missing review attestations are rejected. A catalog is limited to 1,000 passages / 5 MiB per import; use separately reviewed batches for larger catalogs.

## Safe matching in v1

Normalization performs exactly these operations, shared with the Java backend:

1. Unicode NFC normalization.
2. Lowercase without a user-locale transformation.
3. Trim and collapse Unicode whitespace to one space.

Punctuation, Vietnamese diacritics, pronouns, tense and negation remain. Word order remains. The initial matcher accepts the complete normalized passage only. It does not automatically accept a substring or semantic approximation.

| Query vs. actual lyric | Treatment |
| --- | --- |
| `  ANH  nhớ EM  ` vs. `anh nhớ em` | Same normalized words. |
| Decomposed Unicode accents vs. the same NFC accents | Same normalized words. |
| `anh nhớ em` vs. `em nhớ anh` | Different speaker/recipient; not an exact match. |
| `I love you` vs. `I don't love you` | Different statement; not an exact match. |
| `nho` vs. `nhớ` | Accent removal is not applied. |
| `love you` vs. `love you!` | Punctuation is retained; these do not match exactly. |
| `I love you` vs. `I love you, but goodbye` | Extra context is not silently accepted. |

This conservative matcher can return no match frequently. That is intentional for a small catalog. The UI should show the original words and let the user hear the entire selected passage before publication. Later semantic retrieval should remain a candidate-finding step with explicit meaning review and selection; it must not relabel paraphrases as exact text.

## Database import and immutability

The importer writes the backend's `lyric_passages` columns using escaped PostgreSQL E-string literals in one transaction. It validates the foreign track/video pair while holding a shared track-table lock, and then issues **INSERT only**. An existing passage ID causes failure; the tool never silently updates already published text or timing. SQL errors stop the batch and prevent partial inserts. Keep the original JSON for full provenance and retain its version alongside the release.

`source_url` contains the canonical recording URL. `rights_basis` contains the declared basis. `rights_reference` contains JSON text with the permission reference, attribution, lyric source, recording duration and complete review attestations. `recording_checked` is true only when all three review checks passed. The backend exposes none of this private provenance through the public passage DTO.

Changing an already sent passage would change what the recipient hears after the author previewed it. Corrections therefore need a new passage ID; do not overwrite the old row. If an existing passage must be withdrawn, use a separately reviewed backend/admin process that preserves historical post context instead of deleting or rewriting it through this importer.

## Source limitations

The tooling does not download YouTube audio or captions, use an unofficial YouTube Music API, hide the embedded player, run forced alignment, or generate a voice. It starts from data the owner has permission to use and has actually checked. A timestamp is a playback instruction, not proof that a lyric was sung there.

Official references for the provider behavior and boundaries:

- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference): visible embedded playback and start/end parameters.
- [YouTube API developer policies](https://developers.google.com/youtube/terms/developer-policies): supported playback and media handling.
- [YouTube captions download](https://developers.google.com/youtube/v3/docs/captions/download): downloading captions is permission-gated and not a general lyric retrieval endpoint.

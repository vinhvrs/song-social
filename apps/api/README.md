# Song Social API

Java 21, Spring Boot 3.5.16, Spring Security, Spring Data JPA, PostgreSQL and Flyway. Spring Session JDBC persists login sessions in the database. This is the social vertical slice of the initial release; DM/realtime, email verification and moderation are not implemented.

## Run

From this directory, with Java 21 and Maven 3.9+:

```sh
mvn test
mvn package
java -jar target/song-social-api-0.1.0.jar
```

Use PostgreSQL 17 or newer. The root Compose setup supplies a database and environment values. Database schema is managed exclusively by `src/main/resources/db/migration`; Hibernate validates it at startup.

| Variable | Default / purpose |
| --- | --- |
| `DATABASE_URL` | `jdbc:postgresql://localhost:5432/song_social`; JDBC URL, not a `postgres://` URL |
| `DATABASE_USERNAME` | `song_social` |
| `DATABASE_PASSWORD` | Empty; configure a real password outside source control |
| `DATABASE_POOL_SIZE` | `5` |
| `PORT` | `8080` |
| `SESSION_COOKIE_SECURE` | `false` for local HTTP; set `true` for HTTPS deployments |
| `SEED_DEMO` | `true`; creates three clearly labelled fictional profiles/posts and a small video catalog |

Seed users have `_demo` handles and **disabled login** with random password hashes. No shared or published demo password exists. Seed inserts are idempotent. `SEED_DEMO=false` prevents future seed execution; it does not delete rows already created. There are no seeded lyric passages.

The application assumes a trusted reverse proxy and uses forwarded headers. Do not expose it behind an untrusted intermediary that accepts arbitrary forwarded headers. Use the Next.js same-origin proxy, restrict the backend origin at the network level, and set secure cookies for public deployments.

## Authentication

1. `GET /api/v1/auth/csrf` returns a token and `XSRF-TOKEN` cookie.
2. Send both cookie and `X-XSRF-TOKEN` header for every mutation, including registration/login.
3. Registration/login creates `SONG_SESSION`, an HttpOnly, SameSite=Lax cookie; context is persisted in PostgreSQL. Authentication changes rotate the session identifier and clear the prior CSRF cookie. Fetch a fresh CSRF token afterwards.
4. `POST /api/v1/auth/logout` invalidates the database session and expires both cookies.

Passwords are BCrypt hashes (cost 12). Input is limited to 10–72 characters and at most 72 UTF-8 bytes on registration. No session or password value is returned to JavaScript storage. API reads return public DTOs without email/password fields. Public browsing is allowed; following feed, private saved posts and all writes require authentication. Only authors can delete their posts. Follow/like/save operations are idempotent and lock their target record while updating unique relations.

Public production hardening still needs verified email / recovery, abuse throttling, moderation and reporting, operational backups, and a review of deployment access. These are explicit follow-up items; the initial API does not claim to provide them.

## Data and search

- Feed uses bounded keyset pagination. `nextCursor` is an opaque `ISO timestamp~UUID` string; pass it as `before`. Plain ISO timestamps are accepted too. The UUID tie-breaker avoids skipping posts with identical timestamps.
- User posts and saved-post collections currently return up to 50 posts. Comments return up to 100. They need pagination when those surfaces exceed initial-use volume.
- Post mapping batches social counts and relationship state; it does not issue one count query per post.
- The curated music catalog uses official YouTube IDs, not scraped audio. The frontend must show the visible official player.
- Search returns only exact full-passage matches from `REVIEWED` records. Unicode NFC, lowercase and whitespace are normalized; punctuation, diacritics, negation, pronouns, tense and word order remain intact. There are no vector/mood/substring substitutes.
- `pg_trgm` and embeddings are intentionally not enabled for this first strict matching implementation.

### Catalog import schema

`music_tracks(id, title, artist, youtube_id, genre, color)` identifies the precise video recording. `lyric_passages` has:

```text
id UUID PK
track_id UUID -> music_tracks(id)
text VARCHAR(2000)
normalized_text VARCHAR(2000)
language VARCHAR(16)
start_ms BIGINT
end_ms BIGINT
verification VARCHAR(16): DRAFT | REVIEWED
source_url TEXT
rights_basis VARCHAR(100)
rights_reference TEXT
reviewer VARCHAR(120)
reviewed_at TIMESTAMPTZ
recording_checked BOOLEAN
```

The database requires `0 <= start_ms < end_ms`. A `REVIEWED` row additionally requires source, permissions reference, reviewer, review timestamp and `recording_checked=true`. These are evidence and attestations, not automated acoustic proof. The Python tool in the root catalog directory validates reviewed input and recording identity before import. A person must compare the actual recording and lyric passage. Initial production schema contains **zero** reviewed passages.

The synthetic lyric fixtures in tests exist only in the isolated test database and explicitly make no claim about lyrics in the associated video. They are never seeded by the application.

## Verification

`mvn test` runs isolated H2/PostgreSQL-mode integration tests against the same Flyway migration, plus normalization tests. They verify real cookie-based registration/session/logout, authentication and CSRF rejection, owner checks, cascade deletion, idempotent reactions/follow/save, meaningful input bounds, honest no-match behavior, provenance constraints and strict literal retrieval. H2 tests do not replace an actual PostgreSQL smoke run; root-level verification records that separately.

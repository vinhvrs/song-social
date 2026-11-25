# Deployment and operating boundaries

## What a web preview contains

A Vercel project rooted at `apps/web` can build without any application secrets. Without `BACKEND_URL`, it deliberately shows a labelled read-only sample community and the visible YouTube player. Registration, publishing, following, reactions and saving require the real API; a preview does not fake those writes.

This is useful for reviewing layout and interaction design. It is not a deployed multi-user backend.

## Full stack deployment

1. Provision a dedicated PostgreSQL database for the intended environment.
2. Build/deploy `apps/api/Dockerfile` on a Java/container host and supply `DATABASE_URL` (JDBC URL), `DATABASE_USERNAME`, `DATABASE_PASSWORD` and `SESSION_COOKIE_SECURE=true` behind HTTPS. `PORT` defaults to 8080; `DATABASE_POOL_SIZE` defaults to 5.
3. The API applies Flyway migrations at startup. Give the migration role the required schema privileges; for a larger deployment, separate migration and runtime roles and run migrations once in the release process.
4. Configure the web's server-only `BACKEND_URL` with the API URL. Keep browser calls on `/api/v1`; session cookies remain on the web origin. The API need not be exposed through a browser CORS policy.
5. Build the web from the same reviewed Git commit. Use a dedicated database for previews; never point test deployments or the smoke script at production data.
6. Verify registration, login, publish, follow, saved library, logout and session behavior through the final HTTPS URL. Verify that unauthorized users cannot delete another author's post.

The supplied Docker Compose configuration implements the same topology locally and only exposes the web on `127.0.0.1`. To expose a server publicly, configure an HTTPS reverse proxy and the appropriate bind/interface intentionally.

## Data and trust

- Keep `.env` files and licensed/private catalog files out of Git. The repo ignores `.env*`, `.data/` and `catalog-private/`.
- PostgreSQL holds accounts, social data, sessions and catalog metadata. Use backups appropriate to the data being stored and test restoration before relying on a production database.
- The included community content is fictional demo data; `_demo` accounts cannot authenticate. Set `SEED_DEMO=false` before a clean production start if no seed community is desired.
- Production starts with no reviewed lyric passages. Import only data for which permission and recording-specific review have been established. Python validation cannot verify the sound of a recording or confer usage rights.
- No third-party music API key, database credential or deployment token is bundled in source.

## Boundaries of v0.1

This is a working development release. Public signup operations still need email verification/recovery, abuse controls/rate limiting appropriate to the host, content reporting/moderation and an account deletion policy. Those are separate work items, not UI controls that silently do nothing.

Music playback remains subject to the source video's availability, embedding restrictions, browser autoplay rules and network conditions. The source link remains available if an embed cannot play. YouTube timing can be approximate; the exact same recording ID and stored boundaries are reused for preview and published passage playback.

Direct messages, realtime notifications, playlists, semantic retrieval and dynamic YouTube Data API search are not included yet. WebSocket/STOMP can be added to the Spring backend when those features are implemented; no unused realtime infrastructure is deployed by v0.1.

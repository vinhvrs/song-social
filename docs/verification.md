# Verification record — 25 November 2026

This record describes checks actually completed for the initial v0.1 source. It is not a claim that a production backend or a reviewed music catalog has been provisioned.

| Check | Result | Evidence / scope |
| --- | --- | --- |
| Java tests | 11 passed | 8 API integration cases, 2 normalization cases, 1 persisted session/cookie/CSRF/logout case |
| Java package | Passed | Spring Boot executable JAR produced from the tested source |
| Frontend origin regression tests | 4 passed | Actual Host preserved despite Next loopback normalization; HTTPS/IPv6/default ports; cross-origin and spoofed forwarding rejection |
| TypeScript | Passed | `next typegen && tsc --noEmit` |
| Next production build | Passed | Next 16.4.6 generated the page and dynamic API proxy successfully |
| Python catalog tests | 26 passed | Structure, provenance, recording/timestamp validation, Unicode, immutability and hostile SQL text |
| Full HTTP flow | 12 scenarios passed | Actual Next proxy → Spring Boot JAR → PostgreSQL 17.12; two separate cookie sessions |
| Actual catalog SQL | 5 checks passed | PostgreSQL temporary tables copied from migrated schema; every synthetic reviewed fixture rolled back |
| Desktop browser | Checked | Public feed backed by PostgreSQL, composer, literal-search no-match state, and visible YouTube iframe with the correct video title |
| Compose and CI YAML | Parsed | Docker Compose and GitHub Actions definitions parsed successfully |

## Real HTTP scenarios

The smoke script verifies public feed/catalog; CSRF rejection; registration and isolated sessions; authorization on private reads/writes; post persistence and author-only deletion; repeat like/unlike; comments and empty-input validation; private saved library; following/unfollowing; profile persistence; honest no-match and rejection of arbitrary passage IDs; deletion, logout and password login.

The HTTP smoke ran through the Next.js proxy on a local full-stack instance, rather than calling only mock controllers. It caught and led to fixes for two integration defects: Next's loopback host normalization in Origin checks, and overly strict JSON media-type enforcement on valid empty-body actions.

## Catalog SQL isolation

The optional PostgreSQL check verifies E-string escaping and Unicode round trips, track/video identity, immutable existing passage IDs, full rollback when a later row fails, and unchanged persistent catalog counts. Synthetic reviewed test passages never enter the application's public tables.

## Limits of this verification

- No reviewed song/lyric/audio fixture ships in production. Structural tests do not certify the sound of a passage or its usage rights.
- The YouTube iframe loaded its controls and correct title in the browser. Actual audio audibility and word-level playback accuracy were not certified; the preview environment showed buffering.
- Authenticated actions were exercised programmatically through the same-origin HTTP proxy. The browser checks covered public UI; they do not substitute for a logged-in browser acceptance run on the final HTTPS deployment.
- Responsive CSS is implemented; a separate physical/mobile-device acceptance run was not performed.
- No Docker engine was available for image/Compose runtime checks. The same Java and Next applications were run directly together with PostgreSQL for the integration checks.
- Hosted Java/database provisioning is separate from a frontend-only Vercel preview. A read-only preview must not be described as a production multi-user deployment.

## Environment note

The workspace Java 21 runtime lacks `lib/ct.sym`; local Maven compilation used source/target 21 instead of `--release 21`. The tracked project remains Java 21, and Docker/CI use a full JDK with the normal Maven command. No workspace-specific proxy settings or toolchain binaries are tracked.

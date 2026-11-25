# Song Social v1 integration contract

Base path: `/api/v1`. Next.js proxies same-origin API requests to Java using `BACKEND_URL` (server-only). JSON for all requests. Session cookies are HttpOnly; mutations require `X-XSRF-TOKEN` from `GET /auth/csrf`. Browser requests use credentials: include. API errors: `{message: string}` with a suitable HTTP status. No localStorage auth token.

## Shared response types

User: `{id: string, handle: string, displayName: string, bio: string, avatarColor: string, followersCount: number, followingCount: number, following: boolean}`.

Track: `{id: string, title: string, artist: string, youtubeId: string, genre: string, color: string}`. IDs are UUID strings. YouTube IDs must be exactly 11 URL-safe characters. Use official visible embedded playback. Metadata seed is illustrative; no invented lyric verification.

Passage: `{id: string, track: Track, text: string, language: string, startMs: number, endMs: number, verification: "REVIEWED"}`. Search only returns reviewed passages with provenance and recording-specific boundaries; do not seed fabricated verified lyric/audio pairs.

Post: `{id: string, author: User, caption: string, track: Track, passage: Passage|null, createdAt: string, likesCount: number, commentsCount: number, liked: boolean, saved: boolean}`. ISO-8601 dates.

Comment: `{id: string, author: User, body: string, createdAt: string}`.

## Routes

- `GET /status` -> `{status:"ok", reviewedPassages:number}`
- `GET /auth/csrf` -> `{token: string}` (and CSRF cookie)
- `GET /auth/me` -> `User | null`
- `POST /auth/register {handle, displayName, email, password}` -> User (201, logged in)
- `POST /auth/login {email, password}` -> User
- `POST /auth/logout` -> 204
- `GET /feed?tab=discover|following&limit=20&before=OPAQUE_CURSOR` -> `{items:Post[],nextCursor:string|null}`. Following requires login; discover is public.
- `POST /posts {caption, trackId, passageId?:string}` -> Post (201). Require caption or passage, max caption 2000.
- `DELETE /posts/{id}` -> 204; only author.
- `POST /posts/{id}/like` -> `{liked:true, likesCount:number}`; idempotent.
- `DELETE /posts/{id}/like` -> `{liked:false, likesCount:number}`.
- `POST /posts/{id}/save` -> 204; idempotent.
- `DELETE /posts/{id}/save` -> 204.
- `GET /posts/{id}/comments` -> `{items:Comment[]}`
- `POST /posts/{id}/comments {body}` -> Comment (201), 1..1000 characters.
- `GET /tracks?q=...` -> `{items:Track[]}` (empty q lists catalog)
- `GET /passages/search?q=...` -> `{items:[{passage:Passage,matchType:"EXACT",score:number}],message:string|null}`. Max q 240. Preserve negation and pronouns: v1 full-passage exact-normalized retrieval only; unsafe substring matches and automatic semantic equivalents are excluded. Empty reviewed catalog returns honest no-match.
- `GET /users?limit=5` -> `{items:User[]}` suggested people (exclude self)
- `GET /users/{handle}` -> User
- `GET /users/{handle}/posts` -> `{items:Post[],nextCursor:null}`
- `PATCH /users/me {displayName,bio}` -> User (max 60 / 280)
- `POST /users/{id}/follow` -> User (updated followed user); no self-follow, idempotent.
- `DELETE /users/{id}/follow` -> User
- `GET /library` -> `{items:Post[],nextCursor:null}` saved posts, requires login.

## Initial delivery boundaries

Implement a genuine social vertical slice: account, feed, music post, reactions/comments, following/profile, saved posts, curated tracks, verified passage search & preview schema. DMs, live notifications, playlists and semantic models remain explicit backlog; do not render working-looking dead controls.

Default production catalog has ZERO reviewed lyric passages until the owner imports reviewed, licensed data. Clearly label demo/seed community content. Never fake successful writes or fall back to local storage when API is unavailable. A disconnected hosted preview may show an explicit read-only sample feed plus real YouTube player and disabled account/write actions.

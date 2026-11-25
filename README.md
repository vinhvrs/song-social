# Song Social

**A social network built around music.**

Song Social brings together music discovery, music-centered posts, personal profiles, social connections, and conversation. People share songs and moments, explore each other's taste, and interact through text and music.

Its distinctive expression feature turns a user's written sentence into an existing sung lyric passage: find the actual words, preview their corresponding passage in a recording, and choose whether to publish or send it. This feature supports posts, replies, and direct messages across the social network.

**Status:** project initialized; application features are planned and not yet implemented.

## Product definition

The foundation is a social network built around music. Feed, profiles, social connections, music discovery, and interactions are core parts of the product. Music messaging is one interaction surface within that network.

| Surface | Intended experience |
| --- | --- |
| Feed and posts | Start a post from a music video, song, or selected lyric passage; add a caption and share it. |
| Profiles and connections | Express musical taste, follow people, and discover their posts and public music collections. |
| Music discovery and library | Find music, play supported media, save songs and passages, and organize playlists. |
| Replies and reactions | Respond to posts with text, reactions, or a selected sung passage. |
| Direct messages | Talk privately with text and music; preview a selected passage before sending. |

## Signature feature: written sentence to sung passage

1. Write what you want to express in a post, reply, or message.
2. Search verified lyric lines and phrases.
3. Review the actual words that will be heard, with literal matches and close paraphrases clearly distinguished.
4. Preview the verified passage in the correct recording.
5. Explicitly select the passage and publish or send it in the intended context.

### Matching requirements

- Retrieve a sung line or contiguous lyric passage linked to its actual recording and timestamps.
- Prioritize literal matches. Offer close paraphrases only when their meaning is preserved and the user selects them.
- Preserve pronouns, negation, tense, and the direction of the statement.
- Display the real lyric text before publication or sending. Lyrics, source IDs, and timestamps must come from verified data.
- Report when the catalog has no suitable passage.
- Verify that playback includes the selected words and that the audience hears the passage the author previewed.

## Planned initial scope

- Accounts, profiles, and following.
- A music-centered feed, post creation, comments, and reactions.
- Music discovery, saved tracks, and personal playlists.
- A shared music/passage card used in posts, replies, and direct messages.
- A small, reviewed lyric-passage catalog with recording-specific timestamps.
- Sentence-to-passage search, accurate preview, and clear no-match behavior.
- Basic visibility and ownership controls for posts, profiles, collections, and conversations.

Listening rooms and advanced recommendation features are possible later additions. Technology choices and implementation details remain open.

## Media and data

Use lyric data and audio sources with appropriate permissions. YouTube integrations should use the official APIs and a visible embedded player. Playback precision depends on the provider; a timestamp does not by itself guarantee a word-accurate start. Validate Vietnamese lyric text and passage boundaries before adding entries to the reviewed catalog.

## Name

**Song Social** describes the product's foundation: a social network built around music. The repository name `song-social` was selected by the owner on **2026-11-25**.

## Background

The concept grows from the music and social experiences explored in CatWave and VibeTalk. This repository starts with the product definition; previous application code has not been imported.

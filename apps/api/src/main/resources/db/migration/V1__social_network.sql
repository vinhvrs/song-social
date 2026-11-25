CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    handle VARCHAR(24) NOT NULL UNIQUE,
    display_name VARCHAR(60) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    bio VARCHAR(280) NOT NULL DEFAULT '',
    avatar_color VARCHAR(7) NOT NULL DEFAULT '#c7f0dd',
    login_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE TABLE music_tracks (
    id UUID PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    artist VARCHAR(120) NOT NULL,
    youtube_id VARCHAR(11) NOT NULL UNIQUE,
    genre VARCHAR(60) NOT NULL,
    color VARCHAR(7) NOT NULL,
    CONSTRAINT youtube_id_length CHECK (CHAR_LENGTH(youtube_id) = 11)
);
CREATE TABLE lyric_passages (
    id UUID PRIMARY KEY,
    track_id UUID NOT NULL REFERENCES music_tracks(id),
    text VARCHAR(2000) NOT NULL,
    normalized_text VARCHAR(2000) NOT NULL,
    language VARCHAR(16) NOT NULL,
    start_ms BIGINT NOT NULL,
    end_ms BIGINT NOT NULL,
    verification VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    source_url TEXT,
    rights_basis VARCHAR(100),
    rights_reference TEXT,
    reviewer VARCHAR(120),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    recording_checked BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT passage_range CHECK (start_ms >= 0 AND end_ms > start_ms),
    CONSTRAINT passage_status CHECK (verification IN ('DRAFT', 'REVIEWED')),
    CONSTRAINT passage_review CHECK (verification <> 'REVIEWED' OR (
        source_url IS NOT NULL AND CHAR_LENGTH(TRIM(source_url)) > 0 AND
        rights_basis IS NOT NULL AND CHAR_LENGTH(TRIM(rights_basis)) > 0 AND
        rights_reference IS NOT NULL AND CHAR_LENGTH(TRIM(rights_reference)) > 0 AND
        reviewer IS NOT NULL AND CHAR_LENGTH(TRIM(reviewer)) > 0 AND
        reviewed_at IS NOT NULL AND recording_checked = TRUE
    ))
);
CREATE INDEX idx_passage_literal ON lyric_passages(verification, normalized_text);
CREATE TABLE social_posts (
    id UUID PRIMARY KEY,
    author_id UUID NOT NULL REFERENCES accounts(id),
    caption VARCHAR(2000) NOT NULL,
    track_id UUID NOT NULL REFERENCES music_tracks(id),
    passage_id UUID REFERENCES lyric_passages(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_posts_feed ON social_posts(created_at DESC, id DESC);
CREATE INDEX idx_posts_author ON social_posts(author_id, created_at DESC);
CREATE TABLE follows (
    id UUID PRIMARY KEY,
    follower_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (follower_id, following_id),
    CONSTRAINT not_self_follow CHECK (follower_id <> following_id)
);
CREATE INDEX idx_follows_target ON follows(following_id);
CREATE TABLE post_likes (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (user_id, post_id)
);
CREATE INDEX idx_likes_post ON post_likes(post_id);
CREATE TABLE saved_posts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (user_id, post_id)
);
CREATE TABLE comments (
    id UUID PRIMARY KEY,
    author_id UUID NOT NULL REFERENCES accounts(id),
    post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    body VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_comments_post ON comments(post_id, created_at);
CREATE TABLE spring_session (
    primary_id CHAR(36) NOT NULL PRIMARY KEY,
    session_id CHAR(36) NOT NULL,
    creation_time BIGINT NOT NULL,
    last_access_time BIGINT NOT NULL,
    max_inactive_interval INT NOT NULL,
    expiry_time BIGINT NOT NULL,
    principal_name VARCHAR(100)
);
CREATE UNIQUE INDEX spring_session_ix1 ON spring_session(session_id);
CREATE INDEX spring_session_ix2 ON spring_session(expiry_time);
CREATE INDEX spring_session_ix3 ON spring_session(principal_name);
CREATE TABLE spring_session_attributes (
    session_primary_id CHAR(36) NOT NULL REFERENCES spring_session(primary_id) ON DELETE CASCADE,
    attribute_name VARCHAR(200) NOT NULL,
    attribute_bytes BYTEA NOT NULL,
    PRIMARY KEY (session_primary_id, attribute_name)
);

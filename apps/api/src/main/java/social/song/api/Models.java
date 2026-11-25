package social.song.api;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "accounts")
class Account {
    @Id UUID id = UUID.randomUUID();
    @Column(nullable = false, unique = true, length = 24) String handle;
    @Column(nullable = false, length = 60) String displayName;
    @Column(nullable = false, unique = true, length = 254) String email;
    @Column(nullable = false, length = 100) String passwordHash;
    @Column(nullable = false, length = 280) String bio = "";
    @Column(nullable = false, length = 7) String avatarColor = "#c7f0dd";
    @Column(nullable = false) boolean loginEnabled = true;
    @Column(nullable = false) Instant createdAt = Instant.now();
    protected Account() {}
    public UUID getId() { return id; }
    public String getHandle() { return handle; }
    public String getDisplayName() { return displayName; }
    public String getBio() { return bio; }
    public String getAvatarColor() { return avatarColor; }
}

@Entity
@Table(name = "music_tracks")
class MusicTrack {
    @Id UUID id = UUID.randomUUID();
    @Column(nullable = false, length = 160) String title;
    @Column(nullable = false, length = 120) String artist;
    @Column(nullable = false, unique = true, length = 11) String youtubeId;
    @Column(nullable = false, length = 60) String genre;
    @Column(nullable = false, length = 7) String color;
    protected MusicTrack() {}
    public UUID getId() { return id; }
    public String getTitle() { return title; }
    public String getArtist() { return artist; }
    public String getYoutubeId() { return youtubeId; }
    public String getGenre() { return genre; }
    public String getColor() { return color; }
}

@Entity
@Table(name = "lyric_passages")
class LyricPassage {
    @Id UUID id = UUID.randomUUID();
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "track_id") MusicTrack track;
    @Column(nullable = false, length = 2000) String text;
    @Column(nullable = false, length = 2000) String normalizedText;
    @Column(nullable = false, length = 16) String language;
    @Column(nullable = false) long startMs;
    @Column(nullable = false) long endMs;
    @Column(nullable = false, length = 16) String verification = "DRAFT";
    @Column(columnDefinition = "text") String sourceUrl;
    @Column(length = 100) String rightsBasis;
    @Column(columnDefinition = "text") String rightsReference;
    @Column(length = 120) String reviewer;
    Instant reviewedAt;
    @Column(nullable = false) boolean recordingChecked;
    protected LyricPassage() {}
    public UUID getId() { return id; }
    public MusicTrack getTrack() { return track; }
    public String getText() { return text; }
    public String getLanguage() { return language; }
    public long getStartMs() { return startMs; }
    public long getEndMs() { return endMs; }
    public String getVerification() { return verification; }
}

@Entity
@Table(name = "social_posts")
class SocialPost {
    @Id UUID id = UUID.randomUUID();
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "author_id") Account author;
    @Column(nullable = false, length = 2000) String caption;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "track_id") MusicTrack track;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "passage_id") LyricPassage passage;
    @Column(nullable = false) Instant createdAt = Instant.now();
    protected SocialPost() {}
}

@Entity
@Table(name = "comments")
class Comment {
    @Id UUID id = UUID.randomUUID();
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "author_id") Account author;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "post_id") SocialPost post;
    @Column(nullable = false, length = 1000) String body;
    @Column(nullable = false) Instant createdAt = Instant.now();
    protected Comment() {}
}

@Entity
@Table(name = "follows")
class Follow {
    @Id UUID id = UUID.randomUUID();
    @Column(nullable = false) UUID followerId;
    @Column(nullable = false) UUID followingId;
    @Column(nullable = false) Instant createdAt = Instant.now();
    protected Follow() {}
}

@Entity
@Table(name = "post_likes")
class PostLike {
    @Id UUID id = UUID.randomUUID();
    @Column(nullable = false) UUID userId;
    @Column(nullable = false) UUID postId;
    @Column(nullable = false) Instant createdAt = Instant.now();
    protected PostLike() {}
}

@Entity
@Table(name = "saved_posts")
class SavedPost {
    @Id UUID id = UUID.randomUUID();
    @Column(nullable = false) UUID userId;
    @Column(nullable = false) UUID postId;
    @Column(nullable = false) Instant createdAt = Instant.now();
    protected SavedPost() {}
}

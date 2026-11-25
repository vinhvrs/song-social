package social.song.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class Views {
    private Views() {}
    record User(UUID id, String handle, String displayName, String bio, String avatarColor,
                long followersCount, long followingCount, boolean following) {}
    record Track(UUID id, String title, String artist, String youtubeId, String genre, String color) {}
    record Passage(UUID id, Track track, String text, String language, long startMs, long endMs, String verification) {}
    record Post(UUID id, User author, String caption, Track track, Passage passage, Instant createdAt,
                long likesCount, long commentsCount, boolean liked, boolean saved) {}
    record CommentView(UUID id, User author, String body, Instant createdAt) {}
    record Page<T>(List<T> items, String nextCursor) {}
    record Items<T>(List<T> items) {}
    record Match(Passage passage, String matchType, double score) {}
    record Search(List<Match> items, String message) {}
}

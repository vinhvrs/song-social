package social.song.api;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class ApiMapper {
    private final NamedParameterJdbcTemplate jdbc;
    ApiMapper(NamedParameterJdbcTemplate jdbc) { this.jdbc = jdbc; }

    Views.Track track(MusicTrack track) {
        return new Views.Track(track.getId(), track.getTitle(), track.getArtist(), track.getYoutubeId(), track.getGenre(), track.getColor());
    }
    Views.Passage passage(LyricPassage passage) {
        return passage == null ? null : new Views.Passage(passage.getId(), track(passage.getTrack()), passage.getText(),
                passage.getLanguage(), passage.getStartMs(), passage.getEndMs(), passage.getVerification());
    }
    Views.User user(Account account, UUID viewer) { return users(List.of(account), viewer).getFirst(); }
    List<Views.User> users(List<Account> accounts, UUID viewer) {
        if (accounts.isEmpty()) return List.of();
        List<UUID> ids = accounts.stream().map(a -> a.getId()).distinct().toList();
        Map<UUID, Long> followers = counts("follows", "following_id", ids);
        Map<UUID, Long> following = counts("follows", "follower_id", ids);
        Set<UUID> followed = viewer == null ? Set.of() : userRelations("follows", "follower_id", "following_id", viewer, ids);
        return accounts.stream().map(a -> new Views.User(a.getId(), a.getHandle(), a.getDisplayName(), a.getBio(), a.getAvatarColor(),
                followers.getOrDefault(a.getId(), 0L), following.getOrDefault(a.getId(), 0L), followed.contains(a.getId()))).toList();
    }
    List<Views.Post> posts(List<SocialPost> posts, UUID viewer) {
        if (posts.isEmpty()) return List.of();
        List<UUID> ids = posts.stream().map(p -> p.id).toList();
        Map<UUID, Long> likes = counts("post_likes", "post_id", ids);
        Map<UUID, Long> comments = counts("comments", "post_id", ids);
        Set<UUID> liked = viewer == null ? Set.of() : userRelations("post_likes", "user_id", "post_id", viewer, ids);
        Set<UUID> saved = viewer == null ? Set.of() : userRelations("saved_posts", "user_id", "post_id", viewer, ids);
        Map<UUID, Views.User> authors = users(posts.stream().map(p -> p.author).distinct().toList(), viewer)
                .stream().collect(Collectors.toMap(Views.User::id, Function.identity()));
        return posts.stream().map(p -> new Views.Post(p.id, authors.get(p.author.getId()), p.caption, track(p.track),
                passage(p.passage), p.createdAt, likes.getOrDefault(p.id, 0L), comments.getOrDefault(p.id, 0L),
                liked.contains(p.id), saved.contains(p.id))).toList();
    }
    List<Views.CommentView> comments(List<Comment> comments, UUID viewer) {
        if (comments.isEmpty()) return List.of();
        Map<UUID, Views.User> authors = users(comments.stream().map(c -> c.author).distinct().toList(), viewer)
                .stream().collect(Collectors.toMap(Views.User::id, Function.identity()));
        return comments.stream().map(c -> new Views.CommentView(c.id, authors.get(c.author.getId()), c.body, c.createdAt)).toList();
    }
    private Map<UUID, Long> counts(String table, String column, List<UUID> ids) {
        // table/column are exclusively constants in this class; user values are bound parameters.
        Map<UUID, Long> result = new HashMap<>();
        jdbc.query("select " + column + ", count(*) from " + table + " where " + column + " in (:ids) group by " + column,
                Map.of("ids", ids), row -> { result.put(row.getObject(1, UUID.class), row.getLong(2)); });
        return result;
    }
    private Set<UUID> userRelations(String table, String ownerColumn, String targetColumn, UUID viewer, List<UUID> ids) {
        return new HashSet<>(jdbc.query("select " + targetColumn + " from " + table + " where " + ownerColumn
                        + " = :viewer and " + targetColumn + " in (:ids)",
                Map.of("viewer", viewer, "ids", ids), (row, index) -> row.getObject(1, UUID.class)));
    }
}

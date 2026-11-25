package social.song.api;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
class SocialService {
    private static final UUID MAX_UUID = UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff");
    private final AccountRepository accounts;
    private final TrackRepository tracks;
    private final PassageRepository passages;
    private final PostRepository posts;
    private final CommentRepository comments;
    private final FollowRepository follows;
    private final LikeRepository likes;
    private final SaveRepository saves;
    private final PasswordEncoder passwords;
    private final ApiMapper mapper;

    SocialService(AccountRepository accounts, TrackRepository tracks, PassageRepository passages, PostRepository posts,
                  CommentRepository comments, FollowRepository follows, LikeRepository likes, SaveRepository saves,
                  PasswordEncoder passwords, ApiMapper mapper) {
        this.accounts=accounts; this.tracks=tracks; this.passages=passages; this.posts=posts; this.comments=comments;
        this.follows=follows; this.likes=likes; this.saves=saves; this.passwords=passwords; this.mapper=mapper;
    }

    static UUID viewer(Authentication authentication) {
        return authentication == null || authentication instanceof AnonymousAuthenticationToken ? null : UUID.fromString(authentication.getName());
    }
    static UUID requireUser(UUID user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Đăng nhập để tiếp tục.");
        return user;
    }
    private Account account(UUID id) { return accounts.findById(id).orElseThrow(() -> missing("Người dùng")); }
    private Account account(String handle) { return accounts.findByHandle(handle).orElseThrow(() -> missing("Người dùng")); }
    private SocialPost lockPost(UUID id) { return posts.lockById(id).orElseThrow(() -> missing("Bài đăng")); }
    private static ResponseStatusException missing(String label) { return new ResponseStatusException(HttpStatus.NOT_FOUND, label + " không tồn tại."); }
    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }

    Views.User me(UUID viewer) { return viewer == null ? null : mapper.user(account(viewer), viewer); }
    Views.User profile(String handle, UUID viewer) { return mapper.user(account(handle), viewer); }
    long reviewedPassages() { return passages.countByVerification("REVIEWED"); }

    @Transactional
    UUID register(String handle, String displayName, String email, String password) {
        String normalizedEmail = email.strip().toLowerCase(Locale.ROOT);
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) throw invalid("Mật khẩu tối đa 72 byte UTF-8.");
        if (accounts.existsByHandle(handle) || accounts.existsByEmail(normalizedEmail))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tên người dùng hoặc email đã được sử dụng.");
        Account account = new Account();
        account.handle = handle; account.displayName = displayName.strip(); account.email = normalizedEmail;
        account.passwordHash = passwords.encode(password);
        accounts.saveAndFlush(account);
        return account.id;
    }

    Views.Page<Views.Post> feed(String tab, int limit, String before, UUID viewer) {
        if (!Set.of("discover", "following").contains(tab)) throw invalid("Tab không hợp lệ.");
        Instant boundary = Instant.now().plusSeconds(60);
        UUID boundaryId = MAX_UUID;
        if (before != null && !before.isBlank()) {
            try {
                String[] cursor = before.split("~", -1);
                if (cursor.length > 2) throw new IllegalArgumentException();
                boundary = Instant.parse(cursor[0]);
                boundaryId = cursor.length == 2 ? UUID.fromString(cursor[1]) : MAX_UUID;
            } catch (DateTimeParseException | IllegalArgumentException error) { throw invalid("Con trỏ phân trang không hợp lệ."); }
        }
        List<SocialPost> rows = tab.equals("following")
                ? posts.followingFeed(requireUser(viewer), boundary, boundaryId, PageRequest.of(0, limit + 1))
                : posts.feed(boundary, boundaryId, PageRequest.of(0, limit + 1));
        boolean more = rows.size() > limit;
        List<SocialPost> page = more ? rows.subList(0, limit) : rows;
        String next = more ? page.getLast().createdAt + "~" + page.getLast().id : null;
        return new Views.Page<>(mapper.posts(page, viewer), next);
    }

    Views.Page<Views.Post> profilePosts(String handle, UUID viewer) {
        return new Views.Page<>(mapper.posts(posts.findByAuthorIdOrderByCreatedAtDesc(account(handle).id, PageRequest.of(0, 50)), viewer), null);
    }
    Views.Page<Views.Post> library(UUID viewer) {
        return new Views.Page<>(mapper.posts(posts.saved(requireUser(viewer), PageRequest.of(0, 50)), viewer), null);
    }
    List<Views.Track> tracks(String query) {
        String q = query.strip();
        return (q.isEmpty() ? tracks.findAllByOrderByTitleAsc(PageRequest.of(0, 30))
                : tracks.findTop30ByTitleContainingIgnoreCaseOrArtistContainingIgnoreCaseOrderByTitleAsc(q, q))
                .stream().map(mapper::track).toList();
    }
    Views.Search search(String query) {
        String q = LyricNormalizer.normalize(query);
        if (q.isEmpty()) return new Views.Search(List.of(), "Viết điều bạn muốn nói để tìm câu hát đã được kiểm chứng.");
        List<Views.Match> matches = passages.findTop20ByVerificationAndNormalizedTextOrderByIdAsc("REVIEWED", q)
                .stream().filter(p -> p.recordingChecked && p.reviewedAt != null && LyricNormalizer.normalize(p.text).equals(q))
                .map(p -> new Views.Match(mapper.passage(p), "EXACT", 1.0)).toList();
        return new Views.Search(matches, matches.isEmpty()
                ? "Chưa có đoạn lời đã kiểm chứng khớp nguyên câu này. Hãy giữ câu chữ của bạn hoặc chọn một bài nhạc để chia sẻ."
                : null);
    }
    List<Views.User> suggestions(int limit, UUID viewer) {
        List<Account> candidates = accounts.findAllByOrderByCreatedAtAsc(PageRequest.of(0, limit + 1)).stream()
                .filter(a -> !a.id.equals(viewer)).limit(limit).toList();
        return mapper.users(candidates, viewer);
    }

    @Transactional
    Views.User updateProfile(UUID viewer, String displayName, String bio) {
        Account a = account(requireUser(viewer));
        a.displayName = displayName.strip(); a.bio = bio.strip();
        return mapper.user(accounts.saveAndFlush(a), viewer);
    }

    @Transactional
    Views.Post createPost(UUID viewer, String caption, UUID trackId, UUID passageId) {
        requireUser(viewer);
        if (caption.isBlank() && passageId == null) throw invalid("Viết một lời chia sẻ hoặc chọn đoạn lời.");
        SocialPost post = new SocialPost();
        post.author = account(viewer); post.caption = caption.strip();
        post.track = tracks.findById(trackId).orElseThrow(() -> missing("Bài nhạc"));
        if (passageId != null) {
            LyricPassage passage = passages.findByIdAndVerification(passageId, "REVIEWED").orElseThrow(() -> missing("Đoạn lời đã kiểm chứng"));
            if (!passage.track.getId().equals(trackId) || !passage.recordingChecked) throw invalid("Đoạn lời không thuộc bản thu đã chọn.");
            post.passage = passage;
        }
        posts.saveAndFlush(post);
        return mapper.posts(List.of(post), viewer).getFirst();
    }

    @Transactional
    void deletePost(UUID viewer, UUID postId) {
        requireUser(viewer);
        SocialPost post = lockPost(postId);
        if (!post.author.getId().equals(viewer)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ tác giả được xoá bài đăng.");
        posts.delete(post);
        posts.flush();
    }

    @Transactional
    Map<String, Object> like(UUID viewer, UUID postId, boolean enabled) {
        requireUser(viewer); lockPost(postId);
        Optional<PostLike> existing = likes.findByUserIdAndPostId(viewer, postId);
        if (enabled && existing.isEmpty()) {
            PostLike like = new PostLike(); like.userId = viewer; like.postId = postId; likes.saveAndFlush(like);
        } else if (!enabled && existing.isPresent()) { likes.delete(existing.get()); likes.flush(); }
        return Map.of("liked", enabled, "likesCount", likes.countByPostId(postId));
    }
    @Transactional
    void save(UUID viewer, UUID postId, boolean enabled) {
        requireUser(viewer); lockPost(postId);
        Optional<SavedPost> existing = saves.findByUserIdAndPostId(viewer, postId);
        if (enabled && existing.isEmpty()) {
            SavedPost saved = new SavedPost(); saved.userId = viewer; saved.postId = postId; saves.saveAndFlush(saved);
        } else if (!enabled && existing.isPresent()) { saves.delete(existing.get()); saves.flush(); }
    }
    List<Views.CommentView> comments(UUID postId, UUID viewer) {
        if (!posts.existsById(postId)) throw missing("Bài đăng");
        return mapper.comments(comments.findByPostIdOrderByCreatedAtAsc(postId, PageRequest.of(0, 100)), viewer);
    }
    @Transactional
    Views.CommentView comment(UUID viewer, UUID postId, String body) {
        requireUser(viewer);
        Comment comment = new Comment(); comment.author = account(viewer); comment.post = lockPost(postId); comment.body = body.strip();
        comments.saveAndFlush(comment);
        return mapper.comments(List.of(comment), viewer).getFirst();
    }
    @Transactional
    Views.User follow(UUID viewer, UUID target, boolean enabled) {
        requireUser(viewer);
        if (viewer.equals(target)) throw invalid("Bạn không thể theo dõi chính mình.");
        Account other = accounts.lockById(target).orElseThrow(() -> missing("Người dùng"));
        Optional<Follow> existing = follows.findByFollowerIdAndFollowingId(viewer, target);
        if (enabled && existing.isEmpty()) {
            Follow follow = new Follow(); follow.followerId=viewer; follow.followingId=target; follows.saveAndFlush(follow);
        } else if (!enabled && existing.isPresent()) { follows.delete(existing.get()); follows.flush(); }
        return mapper.user(other, viewer);
    }
}

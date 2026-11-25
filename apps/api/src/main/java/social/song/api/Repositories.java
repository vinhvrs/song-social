package social.song.api;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

interface AccountRepository extends JpaRepository<Account, UUID> {
    Optional<Account> findByEmail(String email);
    Optional<Account> findByHandle(String handle);
    boolean existsByEmail(String email);
    boolean existsByHandle(String handle);
    List<Account> findAllByOrderByCreatedAtAsc(Pageable page);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Account a where a.id = :id")
    Optional<Account> lockById(@Param("id") UUID id);
}

interface TrackRepository extends JpaRepository<MusicTrack, UUID> {
    List<MusicTrack> findAllByOrderByTitleAsc(Pageable page);
    List<MusicTrack> findTop30ByTitleContainingIgnoreCaseOrArtistContainingIgnoreCaseOrderByTitleAsc(String title, String artist);
}

interface PassageRepository extends JpaRepository<LyricPassage, UUID> {
    @EntityGraph(attributePaths = {"track"})
    List<LyricPassage> findTop20ByVerificationAndNormalizedTextOrderByIdAsc(String verification, String normalizedText);
    long countByVerification(String verification);
    @EntityGraph(attributePaths = {"track"})
    Optional<LyricPassage> findByIdAndVerification(UUID id, String verification);
}

interface PostRepository extends JpaRepository<SocialPost, UUID> {
    @EntityGraph(attributePaths = {"author", "track", "passage", "passage.track"})
    @Query("select p from SocialPost p where p.createdAt < :before or (p.createdAt = :before and p.id < :beforeId) order by p.createdAt desc, p.id desc")
    List<SocialPost> feed(@Param("before") Instant before, @Param("beforeId") UUID beforeId, Pageable page);
    @EntityGraph(attributePaths = {"author", "track", "passage", "passage.track"})
    @Query("select p from SocialPost p where (p.createdAt < :before or (p.createdAt = :before and p.id < :beforeId)) and p.author.id in (select f.followingId from Follow f where f.followerId = :user) order by p.createdAt desc, p.id desc")
    List<SocialPost> followingFeed(@Param("user") UUID user, @Param("before") Instant before, @Param("beforeId") UUID beforeId, Pageable page);
    @EntityGraph(attributePaths = {"author", "track", "passage", "passage.track"})
    List<SocialPost> findByAuthorIdOrderByCreatedAtDesc(UUID authorId, Pageable page);
    @EntityGraph(attributePaths = {"author", "track", "passage", "passage.track"})
    @Query("select p from SocialPost p where p.id in (select s.postId from SavedPost s where s.userId = :user) order by p.createdAt desc, p.id desc")
    List<SocialPost> saved(@Param("user") UUID user, Pageable page);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from SocialPost p where p.id = :id")
    Optional<SocialPost> lockById(@Param("id") UUID id);
}

interface CommentRepository extends JpaRepository<Comment, UUID> {
    @EntityGraph(attributePaths = {"author"})
    List<Comment> findByPostIdOrderByCreatedAtAsc(UUID postId, Pageable page);
}

interface FollowRepository extends JpaRepository<Follow, UUID> {
    Optional<Follow> findByFollowerIdAndFollowingId(UUID followerId, UUID followingId);
}
interface LikeRepository extends JpaRepository<PostLike, UUID> {
    Optional<PostLike> findByUserIdAndPostId(UUID userId, UUID postId);
    long countByPostId(UUID postId);
}
interface SaveRepository extends JpaRepository<SavedPost, UUID> {
    Optional<SavedPost> findByUserIdAndPostId(UUID userId, UUID postId);
}

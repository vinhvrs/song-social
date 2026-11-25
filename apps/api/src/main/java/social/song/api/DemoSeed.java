package social.song.api;

import java.time.Instant;
import java.util.UUID;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Clearly labelled fictional community content, never verified lyrics or accessible demo accounts. */
@Component
@ConditionalOnProperty(name="song.seed-demo", havingValue="true", matchIfMissing=true)
class DemoSeed implements ApplicationRunner {
    private final AccountRepository accounts;
    private final TrackRepository tracks;
    private final PostRepository posts;
    private final PasswordEncoder passwords;
    DemoSeed(AccountRepository accounts, TrackRepository tracks, PostRepository posts, PasswordEncoder passwords) {
        this.accounts=accounts; this.tracks=tracks; this.posts=posts; this.passwords=passwords;
    }
    @Override @Transactional
    public void run(ApplicationArguments args) {
        MusicTrack first = track(1, "On & On (feat. Daniel Levi)", "Cartoon, Jéja", "K4DyBUG242c", "Electronic", "#c7f0dd");
        MusicTrack second = track(2, "Invincible", "DEAF KEV", "J2X5mJ3HDYE", "Electronic", "#f5c7d5");
        MusicTrack third = track(3, "Never Gonna Give You Up", "Rick Astley", "dQw4w9WgXcQ", "Pop", "#e5dbff");
        Account linh = account(1, "linh_demo", "Linh", "Một bài nhạc, một mẩu chuyện. Hồ sơ minh hoạ.", "#f5d4bc");
        Account khoa = account(2, "khoa_demo", "Khoa", "Nhạc điện tử và những chuyến đi. Hồ sơ minh hoạ.", "#c7f0dd");
        Account mai = account(3, "mai_demo", "Mai", "Giữ lại những giai điệu mình yêu. Hồ sơ minh hoạ.", "#e5dbff");
        post(1, linh, first, "Một chút năng lượng cho buổi sáng. Bạn đang nghe gì hôm nay?", Instant.now().minusSeconds(3600));
        post(2, khoa, second, "Bật bài này lên, đóng những tab còn dang dở và đi dạo một vòng.", Instant.now().minusSeconds(7200));
        post(3, mai, third, "Có những bài nhạc chỉ cần nghe vài giây là thấy cả một thời quay lại.", Instant.now().minusSeconds(10800));
    }
    private MusicTrack track(int number, String title, String artist, String youtube, String genre, String color) {
        UUID id = UUID.fromString("10000000-0000-0000-0000-" + String.format("%012d", number));
        return tracks.findById(id).orElseGet(() -> {
            MusicTrack track = new MusicTrack(); track.id=id; track.title=title; track.artist=artist;
            track.youtubeId=youtube; track.genre=genre; track.color=color;
            return tracks.save(track);
        });
    }
    private Account account(int number, String handle, String name, String bio, String color) {
        UUID id = UUID.fromString("20000000-0000-0000-0000-" + String.format("%012d", number));
        return accounts.findById(id).orElseGet(() -> {
            Account account = new Account(); account.id=id; account.handle=handle; account.displayName=name;
            account.bio=bio; account.avatarColor=color; account.email=handle + "@example.invalid";
            account.passwordHash=passwords.encode(UUID.randomUUID().toString()); account.loginEnabled=false;
            return accounts.save(account);
        });
    }
    private void post(int number, Account author, MusicTrack track, String caption, Instant createdAt) {
        UUID id = UUID.fromString("30000000-0000-0000-0000-" + String.format("%012d", number));
        if (posts.existsById(id)) return;
        SocialPost post = new SocialPost(); post.id=id; post.author=author; post.track=track;
        post.caption=caption; post.createdAt=createdAt; posts.save(post);
    }
}

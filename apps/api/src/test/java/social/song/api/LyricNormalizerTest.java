package social.song.api;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class LyricNormalizerTest {
    @Test void normalizesUnicodeAndWhitespaceWithoutChangingWords() {
        assertThat(LyricNormalizer.normalize("  ANH  nhớ\nEM  ")).isEqualTo("anh nhớ em");
        assertThat(LyricNormalizer.normalize("To\u0302i kho\u0302ng ye\u0302u bạn")).isEqualTo("tôi không yêu bạn");
    }
    @Test void preservesNegationPronounsDiacriticsAndPunctuation() {
        assertThat(LyricNormalizer.normalize("I love you")).isNotEqualTo(LyricNormalizer.normalize("I don't love you"));
        assertThat(LyricNormalizer.normalize("anh nhớ em")).isNotEqualTo(LyricNormalizer.normalize("em nhớ anh"));
        assertThat(LyricNormalizer.normalize("nho")).isNotEqualTo(LyricNormalizer.normalize("nhớ"));
        assertThat(LyricNormalizer.normalize("love you!")).isNotEqualTo(LyricNormalizer.normalize("love you"));
    }
}

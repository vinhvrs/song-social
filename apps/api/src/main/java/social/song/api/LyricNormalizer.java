package social.song.api;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

final class LyricNormalizer {
    private static final Pattern WHITESPACE = Pattern.compile("\\s+", Pattern.UNICODE_CHARACTER_CLASS);
    private LyricNormalizer() {}
    static String normalize(String text) {
        return WHITESPACE.matcher(Normalizer.normalize(text, Normalizer.Form.NFC).toLowerCase(Locale.ROOT))
                .replaceAll(" ").strip();
    }
}

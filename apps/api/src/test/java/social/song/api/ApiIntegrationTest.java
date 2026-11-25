package social.song.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ApiIntegrationTest {
    static final String TRACK = "10000000-0000-0000-0000-000000000001";
    static final String SECOND_TRACK = "10000000-0000-0000-0000-000000000002";
    static final String DEMO_POST = "30000000-0000-0000-0000-000000000001";
    static final UUID FIXTURE_PASSAGE = UUID.fromString("90000000-0000-0000-0000-000000000001");
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired SocialService service;
    UUID owner;
    UUID stranger;

    @BeforeAll void users() {
        owner=service.register("test_owner", "Owner", "owner@example.test", "long-password-123");
        stranger=service.register("test_other", "Other", "other@example.test", "long-password-456");
    }
    @AfterEach void removeSyntheticPassages() {
        jdbc.update("delete from lyric_passages where id = ?", FIXTURE_PASSAGE);
    }
    JsonNode body(MvcResult result) throws Exception { return json.readTree(result.getResponse().getContentAsString()); }
    String payload(Object value) throws Exception { return json.writeValueAsString(value); }
    String newPost() throws Exception {
        MvcResult result=mvc.perform(post("/api/v1/posts").with(user(owner.toString())).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(payload(Map.of("caption", "A real persisted music post", "trackId", TRACK))))
                .andExpect(status().isCreated()).andExpect(jsonPath("author.id").value(owner.toString())).andReturn();
        return body(result).get("id").asText();
    }

    @Test void publicFeedAndHonestUnverifiedCatalog() throws Exception {
        mvc.perform(get("/api/v1/status")).andExpect(status().isOk()).andExpect(jsonPath("reviewedPassages").value(0));
        mvc.perform(get("/api/v1/auth/me")).andExpect(status().isOk()).andExpect(content().string("null"));
        mvc.perform(get("/api/v1/feed")).andExpect(status().isOk()).andExpect(jsonPath("items[0].track.youtubeId").isString());
        mvc.perform(get("/api/v1/passages/search").param("q", "I miss you")).andExpect(status().isOk())
                .andExpect(jsonPath("items").isEmpty()).andExpect(jsonPath("message").isNotEmpty());
        mvc.perform(get("/api/v1/feed").param("tab", "following")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/library")).andExpect(status().isUnauthorized());
    }

    @Test void rejectsMissingAuthCsrfAndInvalidInput() throws Exception {
        String post=payload(Map.of("caption", "Test", "trackId", TRACK));
        mvc.perform(post("/api/v1/posts").contentType(MediaType.APPLICATION_JSON).content(post)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/posts").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(post)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/posts").with(user(owner.toString())).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(payload(Map.of("caption", " ", "trackId", TRACK)))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/feed").param("limit", "1000")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/feed").param("before", "invalid")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/passages/search").param("q", "x".repeat(241))).andExpect(status().isBadRequest());
    }

    @Test void loginFailuresAreGenericAndDemoAccountsCannotAuthenticate() throws Exception {
        mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(payload(Map.of("email", "owner@example.test", "password", "wrong-password"))))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("message").value("Email hoặc mật khẩu không đúng."));
        mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(payload(Map.of("email", "linh_demo@example.invalid", "password", "any-password"))))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(payload(Map.of("handle", "unsafe_demo", "displayName", "Demo", "email", "duplicate@example.test", "password", "long-password"))))
                .andExpect(status().isBadRequest());
    }

    @Test void onlyAuthorCanDeleteAndRelationsCascade() throws Exception {
        String id=newPost();
        mvc.perform(delete("/api/v1/posts/"+id).with(user(stranger.toString())).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/posts/"+id+"/like").with(user(stranger.toString())).with(csrf())).andExpect(status().isOk());
        mvc.perform(post("/api/v1/posts/"+id+"/save").with(user(stranger.toString())).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/posts/"+id+"/comments").with(user(stranger.toString())).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(payload(Map.of("body", "A thoughtful reply")))).andExpect(status().isCreated());
        mvc.perform(delete("/api/v1/posts/"+id).with(user(owner.toString())).with(csrf())).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from post_likes where post_id=?", Long.class, UUID.fromString(id))).isZero();
        assertThat(jdbc.queryForObject("select count(*) from comments where post_id=?", Long.class, UUID.fromString(id))).isZero();
        mvc.perform(get("/api/v1/posts/"+id+"/comments")).andExpect(status().isNotFound());
    }

    @Test void likesSavesAndFollowsAreIdempotentAndPersonalized() throws Exception {
        String id=newPost();
        for(int i=0;i<2;i++) {
            mvc.perform(post("/api/v1/posts/"+id+"/like").with(user(stranger.toString())).with(csrf()))
                    .andExpect(status().isOk()).andExpect(jsonPath("likesCount").value(1));
            mvc.perform(post("/api/v1/posts/"+id+"/save").with(user(stranger.toString())).with(csrf())).andExpect(status().isNoContent());
            mvc.perform(post("/api/v1/users/"+owner+"/follow").with(user(stranger.toString())).with(csrf()))
                    .andExpect(status().isOk()).andExpect(jsonPath("following").value(true)).andExpect(jsonPath("followersCount").value(1));
        }
        mvc.perform(get("/api/v1/library").with(user(stranger.toString()))).andExpect(status().isOk())
                .andExpect(jsonPath("items[0].id").value(id)).andExpect(jsonPath("items[0].saved").value(true));
        mvc.perform(get("/api/v1/feed").param("tab", "following").with(user(stranger.toString()))).andExpect(status().isOk())
                .andExpect(jsonPath("items[0].author.id").value(owner.toString()));
        mvc.perform(post("/api/v1/users/"+owner+"/follow").with(user(owner.toString())).with(csrf())).andExpect(status().isBadRequest());
        mvc.perform(delete("/api/v1/posts/"+id+"/like").with(user(stranger.toString())).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("likesCount").value(0));
        mvc.perform(delete("/api/v1/users/"+owner+"/follow").with(user(stranger.toString())).with(csrf())).andExpect(status().isOk()).andExpect(jsonPath("following").value(false));
    }

    @Test void literalSearchRejectsMissingNegationReversedPronounsAndUnreviewedEntries() throws Exception {
        // Synthetic test-only catalog fixture. This is not an assertion about lyrics in the real recording.
        syntheticPassage("I don't love you", "REVIEWED");
        mvc.perform(get("/api/v1/passages/search").param("q", "I love you")).andExpect(jsonPath("items").isEmpty());
        mvc.perform(get("/api/v1/passages/search").param("q", "love you")).andExpect(jsonPath("items").isEmpty());
        mvc.perform(get("/api/v1/passages/search").param("q", "  I DON'T  LOVE YOU "))
                .andExpect(jsonPath("items[0].matchType").value("EXACT")).andExpect(jsonPath("items[0].passage.text").value("I don't love you"));
        jdbc.update("update lyric_passages set verification='DRAFT' where id=?", FIXTURE_PASSAGE);
        mvc.perform(get("/api/v1/passages/search").param("q", "I don't love you")).andExpect(jsonPath("items").isEmpty());
        jdbc.update("delete from lyric_passages where id=?", FIXTURE_PASSAGE);
        syntheticPassage("anh nhớ em", "REVIEWED");
        mvc.perform(get("/api/v1/passages/search").param("q", "em nhớ anh")).andExpect(jsonPath("items").isEmpty());
        mvc.perform(post("/api/v1/posts").with(user(owner.toString())).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(payload(Map.of("caption", "", "trackId", SECOND_TRACK, "passageId", FIXTURE_PASSAGE.toString())))).andExpect(status().isBadRequest());
    }
    @Test void databaseRejectsReviewWithoutEvidence() {
        assertThatThrownBy(() -> jdbc.update("insert into lyric_passages (id,track_id,text,normalized_text,language,start_ms,end_ms,verification,recording_checked) values (?,?,?,?,?,?,?,?,?)",
                FIXTURE_PASSAGE, UUID.fromString(TRACK), "Test", "test", "en", 0, 2000, "REVIEWED", false))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
    @Test void tiedTimestampPaginationDoesNotSkipPosts() throws Exception {
        String first=newPost(); String second=newPost();
        Instant same=Instant.now().minusSeconds(5);
        jdbc.update("update social_posts set created_at=? where id in (?,?)", java.sql.Timestamp.from(same), UUID.fromString(first), UUID.fromString(second));
        MvcResult page=mvc.perform(get("/api/v1/feed").param("limit", "1")).andExpect(status().isOk()).andReturn();
        String cursor=body(page).get("nextCursor").asText();
        MvcResult next=mvc.perform(get("/api/v1/feed").param("limit", "1").param("before", cursor)).andExpect(status().isOk()).andReturn();
        assertThat(body(next).get("items").get(0).get("id").asText()).isNotEqualTo(body(page).get("items").get(0).get("id").asText());
    }
    void syntheticPassage(String text, String verification) {
        jdbc.update("insert into lyric_passages (id,track_id,text,normalized_text,language,start_ms,end_ms,verification,source_url,rights_basis,rights_reference,reviewer,reviewed_at,recording_checked) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                FIXTURE_PASSAGE, UUID.fromString(TRACK), text, LyricNormalizer.normalize(text), "en", 1000, 3000, verification,
                "https://example.invalid/test-fixture", "TEST_ONLY", "Synthetic integration fixture; no acoustic verification claim", "test-suite", java.sql.Timestamp.from(Instant.now()), true);
    }
}

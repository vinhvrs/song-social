package social.song.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Uses real cookie CSRF without Spring Security test post-processors mutating the filter repository. */
@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:song-social-session-tests;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SessionIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    JsonNode body(MvcResult result) throws Exception { return json.readTree(result.getResponse().getContentAsString()); }
    String payload(Object value) throws Exception { return json.writeValueAsString(value); }

    @Test void registrationUsesRealCsrfAndDatabaseSessionThenLogoutRevokesIt() throws Exception {
        MvcResult csrfResult=mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk()).andReturn();
        String token=body(csrfResult).get("token").asText();
        Cookie csrfCookie=csrfResult.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();
        String registration=payload(Map.of("handle", "session_user", "displayName", "Session User", "email", "session@example.test", "password", "session-password-123"));
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(registration)).andExpect(status().isForbidden());
        MvcResult registered=mvc.perform(post("/api/v1/auth/register").cookie(csrfCookie).header("X-XSRF-TOKEN", token)
                .contentType(MediaType.APPLICATION_JSON).content(registration)).andExpect(status().isCreated()).andReturn();
        Cookie session=registered.getResponse().getCookie("SONG_SESSION");
        assertThat(session).isNotNull();
        assertThat(session.isHttpOnly()).isTrue();
        assertThat(registered.getResponse().getHeaders("Set-Cookie").stream().anyMatch(v -> v.startsWith("SONG_SESSION=") && v.contains("SameSite=Lax"))).isTrue();
        mvc.perform(get("/api/v1/auth/me").cookie(session)).andExpect(status().isOk()).andExpect(jsonPath("handle").value("session_user"));
        assertThat(jdbc.queryForObject("select count(*) from spring_session where principal_name = ?", Long.class, body(registered).get("id").asText())).isEqualTo(1);
        MvcResult newCsrf=mvc.perform(get("/api/v1/auth/csrf").cookie(session)).andReturn();
        mvc.perform(post("/api/v1/auth/logout").cookie(session, newCsrf.getResponse().getCookie("XSRF-TOKEN"))
                .header("X-XSRF-TOKEN", body(newCsrf).get("token").asText())).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/auth/me").cookie(session)).andExpect(status().isOk()).andExpect(content().string("null"));
    }

}

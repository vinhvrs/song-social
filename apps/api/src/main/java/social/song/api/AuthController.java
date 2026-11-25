package social.song.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/auth")
class AuthController {
    private final SocialService social;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository contexts;
    private final CookieCsrfTokenRepository csrf;
    private final boolean secureCookies;

    AuthController(SocialService social, AuthenticationManager authenticationManager, SecurityContextRepository contexts,
                   CookieCsrfTokenRepository csrf, @Value("${song.secure-cookies}") boolean secureCookies) {
        this.social=social; this.authenticationManager=authenticationManager; this.contexts=contexts;
        this.csrf=csrf; this.secureCookies=secureCookies;
    }

    record Registration(
            @NotBlank @Pattern(regexp="[a-z0-9_]{3,24}", message="dùng 3–24 chữ thường, số hoặc dấu gạch dưới") String handle,
            @NotBlank @Size(max=60) String displayName,
            @NotBlank @Email @Size(max=254) String email,
            @NotBlank @Size(min=10, max=72, message="cần 10–72 ký tự và tối đa 72 byte UTF-8") String password) {}
    record Login(@NotBlank @Email @Size(max=254) String email, @NotBlank @Size(max=72) String password) {}

    @GetMapping("/csrf") Map<String, String> csrf(CsrfToken token) { return Map.of("token", token.getToken()); }
    @GetMapping("/me") Object me(Authentication authentication) {
        Views.User user = social.me(SocialService.viewer(authentication));
        return user == null ? com.fasterxml.jackson.databind.node.NullNode.getInstance() : user;
    }

    @PostMapping("/register")
    ResponseEntity<Views.User> register(@Valid @RequestBody Registration input, HttpServletRequest request, HttpServletResponse response) {
        if (input.handle().endsWith("_demo")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hậu tố _demo dành cho hồ sơ minh hoạ.");
        social.register(input.handle(), input.displayName(), input.email(), input.password());
        UUID user = authenticate(input.email(), input.password(), request, response);
        return ResponseEntity.status(HttpStatus.CREATED).body(social.me(user));
    }
    @PostMapping("/login")
    Views.User login(@Valid @RequestBody Login input, HttpServletRequest request, HttpServletResponse response) {
        if (input.password().getBytes(StandardCharsets.UTF_8).length > 72) throw new BadCredentialsException("Invalid credentials");
        return social.me(authenticate(input.email(), input.password(), request, response));
    }
    private UUID authenticate(String email, String password, HttpServletRequest request, HttpServletResponse response) {
        Authentication authentication = authenticationManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(email, password));
        request.getSession(true);
        request.changeSessionId();
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        csrf.saveToken(null, request, response);
        response.setHeader("Cache-Control", "no-store");
        return SocialService.viewer(authentication);
    }
    @PostMapping("/logout")
    ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        SecurityContextHolder.clearContext();
        csrf.saveToken(null, request, response);
        response.addHeader("Set-Cookie", ResponseCookie.from("SONG_SESSION", "").path("/").httpOnly(true)
                .secure(secureCookies).sameSite("Lax").maxAge(0).build().toString());
        return ResponseEntity.noContent().build();
    }
}

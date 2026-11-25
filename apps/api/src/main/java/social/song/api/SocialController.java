package social.song.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
class SocialController {
    private final SocialService social;
    private final boolean demoContent;
    SocialController(SocialService social, @Value("${song.seed-demo}") boolean demoContent) { this.social=social; this.demoContent=demoContent; }

    record NewPost(@NotNull @Size(max=2000) String caption, @NotNull UUID trackId, UUID passageId) {}
    record NewComment(@NotBlank @Size(max=1000) String body) {}
    record ProfileEdit(@NotBlank @Size(max=60) String displayName, @NotNull @Size(max=280) String bio) {}

    @GetMapping("/status") Map<String, Object> status() {
        return Map.of("status", "ok", "reviewedPassages", social.reviewedPassages(), "demoContent", demoContent);
    }
    @GetMapping("/feed") Views.Page<Views.Post> feed(@RequestParam(defaultValue="discover") String tab,
            @RequestParam(defaultValue="20") @Min(1) @Max(50) int limit,
            @RequestParam(required=false) @Size(max=100) String before, Authentication auth) {
        return social.feed(tab, limit, before, SocialService.viewer(auth));
    }
    @GetMapping("/tracks") Views.Items<Views.Track> tracks(@RequestParam(defaultValue="") @Size(max=120) String q) {
        return new Views.Items<>(social.tracks(q));
    }
    @GetMapping("/passages/search") Views.Search search(@RequestParam(defaultValue="") @Size(max=240) String q) {
        return social.search(q);
    }
    @GetMapping("/users") Views.Items<Views.User> users(@RequestParam(defaultValue="5") @Min(1) @Max(20) int limit, Authentication auth) {
        return new Views.Items<>(social.suggestions(limit, SocialService.viewer(auth)));
    }
    @GetMapping("/users/{handle}") Views.User profile(@PathVariable String handle, Authentication auth) {
        return social.profile(handle, SocialService.viewer(auth));
    }
    @GetMapping("/users/{handle}/posts") Views.Page<Views.Post> profilePosts(@PathVariable String handle, Authentication auth) {
        return social.profilePosts(handle, SocialService.viewer(auth));
    }
    @GetMapping("/library") Views.Page<Views.Post> library(Authentication auth) { return social.library(SocialService.viewer(auth)); }
    @PatchMapping("/users/me") Views.User profileEdit(@Valid @RequestBody ProfileEdit input, Authentication auth) {
        return social.updateProfile(SocialService.viewer(auth), input.displayName(), input.bio());
    }
    @PostMapping("/posts") ResponseEntity<Views.Post> create(@Valid @RequestBody NewPost input, Authentication auth) {
        return ResponseEntity.status(201).body(social.createPost(SocialService.viewer(auth), input.caption(), input.trackId(), input.passageId()));
    }
    @DeleteMapping("/posts/{id}") ResponseEntity<Void> delete(@PathVariable UUID id, Authentication auth) {
        social.deletePost(SocialService.viewer(auth), id); return ResponseEntity.noContent().build();
    }
    @PostMapping("/posts/{id}/like") Map<String, Object> like(@PathVariable UUID id, Authentication auth) { return social.like(SocialService.viewer(auth), id, true); }
    @DeleteMapping("/posts/{id}/like") Map<String, Object> unlike(@PathVariable UUID id, Authentication auth) { return social.like(SocialService.viewer(auth), id, false); }
    @PostMapping("/posts/{id}/save") ResponseEntity<Void> save(@PathVariable UUID id, Authentication auth) {
        social.save(SocialService.viewer(auth), id, true); return ResponseEntity.noContent().build();
    }
    @DeleteMapping("/posts/{id}/save") ResponseEntity<Void> unsave(@PathVariable UUID id, Authentication auth) {
        social.save(SocialService.viewer(auth), id, false); return ResponseEntity.noContent().build();
    }
    @GetMapping("/posts/{id}/comments") Views.Items<Views.CommentView> comments(@PathVariable UUID id, Authentication auth) {
        return new Views.Items<>(social.comments(id, SocialService.viewer(auth)));
    }
    @PostMapping("/posts/{id}/comments") ResponseEntity<Views.CommentView> comment(@PathVariable UUID id, @Valid @RequestBody NewComment input, Authentication auth) {
        return ResponseEntity.status(201).body(social.comment(SocialService.viewer(auth), id, input.body()));
    }
    @PostMapping("/users/{id}/follow") Views.User follow(@PathVariable UUID id, Authentication auth) { return social.follow(SocialService.viewer(auth), id, true); }
    @DeleteMapping("/users/{id}/follow") Views.User unfollow(@PathVariable UUID id, Authentication auth) { return social.follow(SocialService.viewer(auth), id, false); }
}

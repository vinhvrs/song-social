"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, mutate } from "@/lib/api";
import { demoPosts, demoTracks, demoUsers } from "@/lib/demo";
import type { Page, Passage, Post, Track, User, View } from "@/lib/types";
import { AuthModal, EditProfileModal } from "./account-modals";
import { Composer, type ComposerState } from "./composer";
import { MusicPlayer } from "./music-player";
import { PostCard } from "./post-card";
import { Avatar, Brand, EmptyState, Icon, type IconName } from "./ui";

const navigation: { id: View; label: string; icon: IconName }[] = [
  { id: "feed", label: "Bảng tin", icon: "home" },
  { id: "discover", label: "Khám phá", icon: "compass" },
  { id: "library", label: "Đã lưu", icon: "bookmark" },
  { id: "profile", label: "Hồ sơ", icon: "user" },
];
const titles: Record<View, { title: string; subtitle: string }> = {
  feed: { title: "Bảng tin", subtitle: "Những điều muốn nói, bằng âm nhạc." },
  discover: {
    title: "Khám phá",
    subtitle: "Một bài hát mới. Một kết nối mới.",
  },
  library: {
    title: "Góc nhạc đã lưu",
    subtitle: "Giữ lại những giai điệu bạn muốn nghe thêm lần nữa.",
  },
  profile: {
    title: "Hồ sơ",
    subtitle: "Câu chuyện của một người, qua những bài nhạc.",
  },
};
export function SocialApp() {
  const loadVersion = useRef(0);
  const [connection, setConnection] = useState<"loading" | "live" | "preview">(
    "loading",
  );
  const [view, setView] = useState<View>("feed");
  const [tab, setTab] = useState<"discover" | "following">("discover");
  const [user, setUser] = useState<User | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("Tất cả");
  const [profile, setProfile] = useState<User | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [playing, setPlaying] = useState<{
    track: Track;
    passage?: Passage | null;
    onPlayed?: () => void;
  } | null>(null);
  const [followingBusy, setFollowingBusy] = useState<string | null>(null);
  const readOnly = connection !== "live";
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api<{ status: string }>("/status");
      } catch {
        if (!cancelled) {
          setConnection("preview");
          setTracks(demoTracks);
          setPeople(demoUsers);
          setPosts(demoPosts);
          setLoading(false);
        }
        return;
      }
      try {
        const [me, library, suggestions] = await Promise.all([
          api<User | null>("/auth/me"),
          api<{ items: Track[] }>("/tracks"),
          api<{ items: User[] }>("/users?limit=5"),
        ]);
        if (!cancelled) {
          setUser(me);
          setTracks(library.items);
          setPeople(suggestions.items);
          setConnection("live");
        }
      } catch (e) {
        if (!cancelled) {
          setConnection("live");
          setError(errorMessage(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const loadPosts = useCallback(async () => {
    const version = ++loadVersion.current;
    if (connection === "loading") return;
    setError("");
    setCursor(null);
    if (view === "discover") {
      setLoading(false);
      return;
    }
    if (connection === "preview") {
      const selected = handle
        ? demoUsers.find((p) => p.handle === handle) || null
        : null;
      if (view === "profile") setProfile(selected);
      setPosts(
        view === "feed" && tab === "discover"
          ? demoPosts
          : view === "profile" && selected
            ? demoPosts.filter((p) => p.author.handle === selected.handle)
            : [],
      );
      setLoading(false);
      return;
    }
    if (
      (view === "library" ||
        (view === "feed" && tab === "following") ||
        (view === "profile" && !handle)) &&
      !user
    ) {
      setPosts([]);
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let path = "/feed?tab=" + tab;
      if (view === "library") path = "/library";
      if (view === "profile") {
        const profileHandle = handle || user!.handle;
        const [person, data] = await Promise.all([
          api<User>(`/users/${encodeURIComponent(profileHandle)}`),
          api<Page<Post>>(`/users/${encodeURIComponent(profileHandle)}/posts`),
        ]);
        if (version === loadVersion.current) {
          setProfile(person);
          setPosts(data.items);
          setCursor(data.nextCursor);
        }
        return;
      }
      const data = await api<Page<Post>>(path);
      if (version === loadVersion.current) {
        setPosts(data.items);
        setCursor(data.nextCursor);
      }
    } catch (e) {
      if (version === loadVersion.current) {
        setError(errorMessage(e));
        setPosts([]);
      }
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [connection, view, tab, handle, user]);
  useEffect(() => {
    void loadPosts();
    return () => {
      loadVersion.current++;
    };
  }, [loadPosts]);
  function navigate(next: View) {
    setView(next);
    setHandle(null);
    setSearch("");
    setGenre("Tất cả");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openProfile(nextHandle: string) {
    setHandle(nextHandle);
    setView("profile");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openAuth() {
    if (readOnly) {
      notify(
        "Bản xem trước chỉ đọc. Tài khoản cần máy chủ ứng dụng đang hoạt động.",
      );
      return;
    }
    setAuthOpen(true);
  }
  function play(track: Track, passage?: Passage | null, onPlayed?: () => void) {
    setPlaying({ track, passage, onPlayed });
  }
  function updatePost(id: string, patch: Partial<Post>) {
    setPosts((current) =>
      view === "library" && patch.saved === false
        ? current.filter((post) => post.id !== id)
        : current.map((post) =>
            post.id === id ? { ...post, ...patch } : post,
          ),
    );
  }
  async function follow(person: User) {
    if (!user) {
      openAuth();
      return;
    }
    setFollowingBusy(person.id);
    try {
      const updated = await mutate<User>(
        `/users/${person.id}/follow`,
        person.following ? "DELETE" : "POST",
      );
      setPeople((current) =>
        current.map((p) => (p.id === updated.id ? updated : p)),
      );
      setProfile((current) => (current?.id === updated.id ? updated : current));
      setUser((current) =>
        current
          ? {
              ...current,
              followingCount:
                current.followingCount + (updated.following ? 1 : -1),
            }
          : null,
      );
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setFollowingBusy(null);
    }
  }
  async function logout() {
    try {
      await mutate<void>("/auth/logout", "POST");
      setUser(null);
      setPeople((await api<{ items: User[] }>("/users?limit=5")).items);
      navigate("feed");
      setTab("discover");
      notify("Bạn đã đăng xuất.");
    } catch (e) {
      notify(errorMessage(e));
    }
  }
  async function authenticated(next: User) {
    setUser(next);
    try {
      setPeople((await api<{ items: User[] }>("/users?limit=5")).items);
    } catch {}
    notify(`Chào ${next.displayName}, cùng nghe nhạc nhé.`);
  }
  function published(post: Post) {
    navigate("feed");
    setTab("discover");
    setPosts((current) => [post, ...current]);
    notify("Bài nhạc của bạn đã được chia sẻ.");
    if (view === "feed" && tab === "discover") void loadPosts();
  }
  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await api<Page<Post>>(
        `/feed?tab=${tab}&before=${encodeURIComponent(cursor)}`,
      );
      setPosts((current) => [
        ...current,
        ...next.items.filter((item) => !current.some((p) => p.id === item.id)),
      ]);
      setCursor(next.nextCursor);
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }
  const visibleTracks = tracks.filter(
    (t) =>
      (genre === "Tất cả" || t.genre === genre) &&
      `${t.title} ${t.artist}`
        .toLocaleLowerCase("vi")
        .includes(search.toLocaleLowerCase("vi")),
  );
  const requiresAccount =
    !user &&
    (view === "library" ||
      (view === "feed" && tab === "following") ||
      (view === "profile" && !handle));
  const topTitle =
    view === "profile" && profile ? profile.displayName : titles[view].title;
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Đến nội dung chính
      </a>
      <aside className="sidebar">
        <button
          className="brand-button"
          onClick={() => navigate("feed")}
          aria-label="Song Social, về bảng tin"
        >
          <Brand />
        </button>
        <div className="sidebar-caption">
          A LITTLE MUSIC. A LOT OF CONNECTION.
        </div>
        <nav aria-label="Điều hướng chính">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "selected" : ""}`}
              onClick={() => navigate(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {view === item.id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <button
          className="primary-button sidebar-compose"
          onClick={() => setComposer({})}
        >
          <Icon name="plus" size={21} />
          <span>Chia sẻ bài nhạc</span>
        </button>
        <div className="sidebar-note">
          <span className="tiny-disc">
            <Icon name="disc" size={20} />
          </span>
          <p>
            Gu nhạc khác nhau.
            <br />
            Cảm xúc thì kết nối.
          </p>
        </div>
        <div className="sidebar-bottom">
          {user ? (
            <>
              <button
                className="sidebar-account"
                onClick={() => navigate("profile")}
              >
                <Avatar user={user} />
                <span>
                  <strong>{user.displayName}</strong>
                  <small>@{user.handle}</small>
                </span>
              </button>
              <button
                className="icon-button"
                onClick={logout}
                aria-label="Đăng xuất"
              >
                <Icon name="logout" size={20} />
              </button>
            </>
          ) : (
            <div className="guest-account">
              <p>Một chỗ dành cho gu nhạc của bạn.</p>
              <button
                className="secondary-button full-width"
                disabled={readOnly}
                onClick={openAuth}
              >
                Đăng nhập / Đăng ký
              </button>
            </div>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <h1>{topTitle}</h1>
            <p>{titles[view].subtitle}</p>
          </div>
          <div className="topbar-actions">
            <span className="version-label">EARLY ACCESS</span>
            <button
              className="topbar-avatar"
              onClick={() => (user ? navigate("profile") : openAuth())}
              aria-label={user ? "Hồ sơ của tôi" : "Đăng nhập"}
              disabled={readOnly && !user}
            >
              <Avatar user={user} size="small" />
            </button>
          </div>
        </header>
        {connection === "preview" && (
          <div className="preview-banner" role="status">
            <Icon name="info" size={18} />
            <span>
              <strong>Bản xem trước chỉ đọc.</strong> Nội dung cộng đồng là minh
              hoạ. Kết nối máy chủ để tạo tài khoản và lưu bài đăng.
            </span>
          </div>
        )}
        <div className="content-grid">
          <main id="main-content" className="main-content">
            {view === "feed" && (
              <>
                <section className="welcome-card">
                  <div>
                    <span className="eyebrow">TUNE IN. REACH OUT.</span>
                    <h2>
                      Mỗi giai điệu,
                      <br />
                      một kết nối<span>.</span>
                    </h2>
                    <p>
                      Một bài hát nói thay cả ngàn điều.
                      <br />
                      Chia sẻ điều bạn đang nghe hôm nay.
                    </p>
                    <button
                      onClick={() => navigate("discover")}
                      className="welcome-button"
                    >
                      <Icon name="headphones" size={17} />
                      Tìm một giai điệu
                    </button>
                  </div>
                  <div className="vinyl-scene" aria-hidden="true">
                    <div className="record-sleeve">
                      <span>
                        SONG
                        <br />
                        SOCIAL
                      </span>
                      <small>SIDE A · YOUR WORLD</small>
                      <div className="sleeve-flower" />
                    </div>
                    <div className="vinyl-record">
                      <div className="vinyl-label">
                        <span>ss.</span>
                      </div>
                    </div>
                    <span className="music-chip">GOOD MUSIC, GOOD COMPANY</span>
                  </div>
                </section>
                <button
                  className="feed-composer"
                  onClick={() => setComposer({})}
                >
                  <Avatar user={user} />
                  <span>Hôm nay, bạn đang nghe gì?</span>
                  <span className="composer-music-icon">
                    <Icon name="music" size={21} />
                  </span>
                </button>
                <div
                  className="feed-tabs"
                  role="tablist"
                  aria-label="Chọn bảng tin"
                >
                  <button
                    role="tab"
                    aria-selected={tab === "discover"}
                    className={tab === "discover" ? "active" : ""}
                    onClick={() => setTab("discover")}
                  >
                    Dành cho bạn
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "following"}
                    className={tab === "following" ? "active" : ""}
                    onClick={() => setTab("following")}
                  >
                    Đang theo dõi
                  </button>
                  <span className="feed-label">MỚI NHẤT</span>
                </div>
              </>
            )}
            {view === "discover" && (
              <>
                <section className="discover-heading">
                  <span className="eyebrow">FIND YOUR NEXT REPEAT</span>
                  <h2>
                    Chạm vào một
                    <br />
                    tần số mới<span>.</span>
                  </h2>
                  <p>
                    Khám phá danh mục mở đầu của Song Social. Nghe một bài hát,
                    rồi kể câu chuyện của bạn.
                  </p>
                </section>
                <label className="search-box discover-search">
                  <Icon name="search" size={20} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm tên bài hát hoặc nghệ sĩ…"
                    aria-label="Tìm bài hát hoặc nghệ sĩ"
                  />
                </label>
                <div className="genre-filters" aria-label="Lọc thể loại">
                  {["Tất cả", ...new Set(tracks.map((t) => t.genre))].map(
                    (g) => (
                      <button
                        className={genre === g ? "selected" : ""}
                        key={g}
                        aria-pressed={genre === g}
                        onClick={() => setGenre(g)}
                      >
                        {g}
                      </button>
                    ),
                  )}
                </div>
                {connection === "loading" ? (
                  <LoadingFeed />
                ) : visibleTracks.length ? (
                  <div className="discover-grid">
                    {visibleTracks.map((t) => (
                      <article className="discover-track" key={t.id}>
                        <button
                          className="discover-art"
                          style={{ background: t.color }}
                          onClick={() => play(t)}
                          aria-label={`Nghe ${t.title}`}
                        >
                          <img
                            src={`https://i.ytimg.com/vi/${t.youtubeId}/hqdefault.jpg`}
                            alt=""
                            loading="lazy"
                          />
                          <span className="genre-tag">{t.genre}</span>
                          <span className="cover-play">
                            <Icon name="play" size={25} />
                          </span>
                        </button>
                        <div className="discover-track-info">
                          <h3>{t.title}</h3>
                          <p>{t.artist}</p>
                          <button
                            className="text-link"
                            onClick={() => setComposer({ track: t })}
                          >
                            <Icon name="plus" size={17} />
                            Chia sẻ bài này
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Chưa tìm thấy bài hát"
                    text="Thử một tên bài hát hoặc nghệ sĩ khác trong danh mục hiện tại."
                  />
                )}
              </>
            )}
            {view === "profile" && profile && (
              <section className="profile-card">
                <div className="profile-cover">
                  <Icon name="disc" size={160} />
                  <span>
                    MY TASTE.
                    <br />
                    MY LITTLE WORLD.
                  </span>
                </div>
                <div className="profile-content">
                  <Avatar user={profile} size="large" />
                  <div className="profile-action">
                    {user?.id === profile.id ? (
                      <button
                        className="secondary-button"
                        onClick={() => setEditOpen(true)}
                      >
                        <Icon name="edit" size={16} />
                        Chỉnh sửa
                      </button>
                    ) : (
                      <button
                        className={
                          profile.following
                            ? "secondary-button"
                            : "primary-button"
                        }
                        disabled={readOnly || followingBusy === profile.id}
                        onClick={() => follow(profile)}
                      >
                        {profile.following ? "Đang theo dõi" : "Theo dõi"}
                      </button>
                    )}
                  </div>
                  <h2>{profile.displayName}</h2>
                  <p className="profile-handle">
                    @{profile.handle}
                    {profile.handle.endsWith("_demo") && (
                      <span className="sample-tag">Hồ sơ minh hoạ</span>
                    )}
                  </p>
                  <p className="profile-bio">
                    {profile.bio || "Một câu chuyện mới đang bắt đầu."}
                  </p>
                  <div className="profile-counts">
                    <span>
                      <strong>{profile.followersCount}</strong> người theo dõi
                    </span>
                    <span>
                      <strong>{profile.followingCount}</strong> đang theo dõi
                    </span>
                  </div>
                </div>
                <div className="profile-post-label">
                  <Icon name="music" size={18} />
                  Những bài nhạc đã chia sẻ
                </div>
              </section>
            )}
            {error && (
              <div className="error-panel" role="alert">
                <p>{error}</p>
                <button
                  className="secondary-button"
                  onClick={() => void loadPosts()}
                >
                  Thử lại
                </button>
              </div>
            )}
            {view !== "discover" &&
              (loading ? (
                <LoadingFeed />
              ) : requiresAccount ? (
                <EmptyState
                  title={
                    view === "library"
                      ? "Giữ lại những giai điệu bạn thích"
                      : view === "profile"
                        ? "Gu nhạc của bạn, câu chuyện của bạn"
                        : "Theo dõi những người cùng tần số"
                  }
                  text={
                    readOnly
                      ? "Chức năng này cần kết nối máy chủ. Bạn vẫn có thể khám phá và nghe nhạc trong bản xem trước."
                      : "Đăng nhập để tạo góc nhạc riêng và kết nối với cộng đồng."
                  }
                  action={
                    readOnly ? (
                      <button
                        className="secondary-button"
                        onClick={() => navigate("discover")}
                      >
                        Khám phá nhạc
                      </button>
                    ) : (
                      <button className="primary-button" onClick={openAuth}>
                        Đăng nhập / Đăng ký
                      </button>
                    )
                  }
                />
              ) : posts.length ? (
                <div className="post-list">
                  {posts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      user={user}
                      readOnly={readOnly}
                      onAuth={openAuth}
                      onProfile={openProfile}
                      onPlay={play}
                      onUpdate={updatePost}
                      onDelete={(id) => {
                        setPosts((current) =>
                          current.filter((p) => p.id !== id),
                        );
                        notify("Đã xoá bài đăng.");
                      }}
                      onError={notify}
                    />
                  ))}
                </div>
              ) : (
                !error && (
                  <EmptyState
                    title={
                      view === "library"
                        ? "Chưa có bài nhạc đã lưu"
                        : "Một khoảng trống cho giai điệu mới"
                    }
                    text={
                      view === "library"
                        ? "Nhấn biểu tượng lưu trên một bài đăng để tìm lại bài nhạc tại đây."
                        : tab === "following" && view === "feed"
                          ? "Theo dõi một vài người yêu nhạc để xem bài đăng của họ tại đây."
                          : "Hãy mở đầu bằng một bài hát và câu chuyện của bạn."
                    }
                    action={
                      <button
                        className="secondary-button"
                        onClick={() =>
                          view === "library"
                            ? navigate("feed")
                            : setComposer({})
                        }
                      >
                        {view === "library"
                          ? "Về bảng tin"
                          : "Chia sẻ một bài hát"}
                      </button>
                    }
                  />
                )
              ))}
            {cursor && view === "feed" && !loading && (
              <button
                className="load-more secondary-button"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? "Đang tải…" : "Xem thêm bài đăng"}
              </button>
            )}
            <footer className="main-footer">
              <Icon name="disc" size={16} />
              <span>Âm nhạc hay hơn khi có người cùng nghe.</span>
            </footer>
          </main>
          <aside className="rightbar" aria-label="Khám phá cộng đồng">
            <section className="expression-card">
              <div className="feature-top">
                <span className="eyebrow">MỘT CÁCH MỚI ĐỂ NÓI</span>
                <Icon name="sparkle" size={22} />
              </div>
              <h2>
                Để một câu hát
                <br />
                nói thay bạn.
              </h2>
              <p>
                Viết điều muốn nói. Tìm câu hát thật, nghe đúng đoạn, rồi chia
                sẻ.
              </p>
              <div className="waveform" aria-hidden="true">
                {[
                  14, 26, 38, 20, 44, 58, 32, 46, 23, 51, 64, 32, 45, 20, 36,
                  56, 26, 42, 18, 30, 14, 24, 40, 18,
                ].map((h, i) => (
                  <span key={i} style={{ height: h }} />
                ))}
              </div>
              <button
                className="expression-button"
                onClick={() => setComposer({ mode: "passage" })}
              >
                <Icon name="music" size={17} />
                Thử nói bằng nhạc
              </button>
              <small>Chỉ dùng đoạn lời đã được kiểm duyệt.</small>
            </section>
            <section className="right-section">
              <div className="section-title">
                <h2>Cùng tần số</h2>
                <Icon name="headphones" size={18} />
              </div>
              <p className="section-description">
                Bắt đầu từ một gu nhạc chung.
              </p>
              <div className="people-list">
                {people
                  .filter((p) => p.id !== user?.id)
                  .slice(0, 3)
                  .map((person) => (
                    <div className="person" key={person.id}>
                      <button
                        className="person-info"
                        onClick={() => openProfile(person.handle)}
                      >
                        <Avatar user={person} size="small" />
                        <span>
                          <strong>{person.displayName}</strong>
                          <small>@{person.handle}</small>
                        </span>
                      </button>
                      <button
                        className={`follow-small ${person.following ? "following" : ""}`}
                        onClick={() => follow(person)}
                        disabled={readOnly || followingBusy === person.id}
                        aria-label={`${person.following ? "Bỏ theo dõi" : "Theo dõi"} ${person.displayName}`}
                        aria-pressed={person.following}
                      >
                        <Icon
                          name={person.following ? "check" : "plus"}
                          size={17}
                        />
                      </button>
                    </div>
                  ))}
              </div>
            </section>
            <section className="right-section music-selection">
              <div className="section-title">
                <h2>Thêm vào ngày của bạn</h2>
                <Icon name="disc" size={18} />
              </div>
              <div className="small-track-list">
                {tracks.slice(0, 3).map((track, i) => (
                  <button
                    className="small-track"
                    key={track.id}
                    onClick={() => play(track)}
                  >
                    <span className="track-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="mini-art"
                      style={{ background: track.color }}
                    >
                      <Icon name="disc" size={23} />
                    </span>
                    <span className="small-track-copy">
                      <strong>{track.title}</strong>
                      <small>{track.artist}</small>
                    </span>
                    <Icon name="play" size={16} />
                  </button>
                ))}
              </div>
              <button
                className="text-link"
                onClick={() => navigate("discover")}
              >
                Khám phá danh mục nhạc
              </button>
            </section>
            <footer className="right-footer">
              <Brand />
              <p>Music brings us a little closer.</p>
              <a
                href="https://github.com/vinhvrs/song-social"
                target="_blank"
                rel="noopener noreferrer"
              >
                Về dự án
              </a>
              <span aria-hidden="true"> · </span>
              <span>Song Social v0.1</span>
            </footer>
          </aside>
        </div>
      </div>
      {composer && (
        <Composer
          initial={composer}
          tracks={tracks}
          user={user}
          readOnly={readOnly}
          onClose={() => setComposer(null)}
          onAuth={openAuth}
          onPublished={published}
          onPlay={play}
        />
      )}
      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onSuccess={authenticated}
        />
      )}
      {editOpen && user && (
        <EditProfileModal
          user={user}
          onClose={() => setEditOpen(false)}
          onSuccess={(updated) => {
            setUser(updated);
            setProfile(updated);
            notify("Hồ sơ đã được cập nhật.");
          }}
        />
      )}
      {playing && <MusicPlayer {...playing} onClose={() => setPlaying(null)} />}
      {toast && (
        <div className="toast" role="status">
          <Icon name="info" size={20} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Đóng thông báo"
            onClick={() => setToast("")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function LoadingFeed() {
  return (
    <div className="loading-feed" role="status" aria-label="Đang tải">
      <div className="skeleton-avatar" />
      <div className="skeleton-line" />
      <div className="skeleton-line short" />
      <div className="skeleton-card" />
      <span className="sr-only">Đang tải nội dung…</span>
    </div>
  );
}

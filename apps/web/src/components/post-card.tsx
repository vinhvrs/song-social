"use client";
import { useEffect, useState } from "react";
import { api, errorMessage, mutate } from "@/lib/api";
import type { Comment, Passage, Post, Track, User } from "@/lib/types";
import { Avatar, Icon, postDate } from "./ui";
export function PostCard({
  post,
  user,
  readOnly,
  onAuth,
  onProfile,
  onPlay,
  onUpdate,
  onDelete,
  onError,
}: {
  post: Post;
  user: User | null;
  readOnly: boolean;
  onAuth: () => void;
  onProfile: (handle: string) => void;
  onPlay: (track: Track, passage?: Passage | null) => void;
  onUpdate: (id: string, patch: Partial<Post>) => void;
  onDelete: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!commentsOpen || readOnly) return;
    const controller = new AbortController();
    setCommentsLoading(true);
    setCommentsError("");
    api<{ items: Comment[] }>(`/posts/${post.id}/comments`, {
      signal: controller.signal,
    })
      .then((data) => setComments(data.items))
      .catch((e) => {
        if (!controller.signal.aborted) setCommentsError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setCommentsLoading(false);
      });
    return () => controller.abort();
  }, [commentsOpen, post.id, readOnly]);
  async function like() {
    if (!user) {
      onAuth();
      return;
    }
    setPending(true);
    try {
      const result = await mutate<{ liked: boolean; likesCount: number }>(
        `/posts/${post.id}/like`,
        post.liked ? "DELETE" : "POST",
      );
      onUpdate(post.id, result);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function save() {
    if (!user) {
      onAuth();
      return;
    }
    setPending(true);
    try {
      await mutate<void>(
        `/posts/${post.id}/save`,
        post.saved ? "DELETE" : "POST",
      );
      onUpdate(post.id, { saved: !post.saved });
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    if (!window.confirm("Xoá bài đăng này? Hành động này không thể hoàn tác."))
      return;
    setPending(true);
    try {
      await mutate<void>(`/posts/${post.id}`, "DELETE");
      onDelete(post.id);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function comment(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      onAuth();
      return;
    }
    if (!body.trim()) return;
    setSending(true);
    setCommentsError("");
    try {
      const newComment = await mutate<Comment>(
        `/posts/${post.id}/comments`,
        "POST",
        { body: body.trim() },
      );
      setComments((items) => [...items, newComment]);
      onUpdate(post.id, { commentsCount: post.commentsCount + 1 });
      setBody("");
    } catch (e) {
      setCommentsError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }
  return (
    <article className="post-card">
      <header className="post-header">
        <button
          className="author-button"
          onClick={() => onProfile(post.author.handle)}
        >
          <Avatar user={post.author} />
          <span>
            <strong>{post.author.displayName}</strong>
            <small>
              @{post.author.handle} <span aria-hidden="true">·</span>{" "}
              <time dateTime={post.createdAt}>{postDate(post.createdAt)}</time>
            </small>
          </span>
        </button>
        {post.author.handle.endsWith("_demo") && (
          <span className="sample-tag">Minh hoạ</span>
        )}
        {user?.id === post.author.id && (
          <button
            className="icon-button delete-post"
            aria-label="Xoá bài đăng"
            onClick={remove}
            disabled={pending}
          >
            <Icon name="trash" size={18} />
          </button>
        )}
      </header>
      <p className="post-caption">{post.caption}</p>
      <button
        className="post-music"
        onClick={() => onPlay(post.track, post.passage)}
        aria-label={`Nghe ${post.passage ? "đoạn đã chọn của " : ""}${post.track.title}`}
      >
        <span className="post-cover" style={{ background: post.track.color }}>
          <img
            src={`https://i.ytimg.com/vi/${post.track.youtubeId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
          />
          <span className="cover-play">
            <Icon name="play" size={22} />
          </span>
        </span>
        <span className="post-track-text">
          <span className="eyebrow">
            <Icon name="music" size={13} />
            {post.passage ? "Đoạn lời đã kiểm duyệt" : "Chia sẻ từ YouTube"}
          </span>
          <strong>{post.track.title}</strong>
          <span>{post.track.artist}</span>
          <span className="genre-tag">{post.track.genre}</span>
        </span>
        <span className="track-vinyl" aria-hidden="true">
          <Icon name="disc" size={76} />
        </span>
      </button>
      {post.passage && (
        <blockquote className="post-lyric">“{post.passage.text}”</blockquote>
      )}
      <footer className="post-actions">
        <button
          className={`reaction ${post.liked ? "is-liked" : ""}`}
          disabled={readOnly || pending}
          onClick={like}
          aria-pressed={post.liked}
          aria-label={`${post.liked ? "Bỏ thích" : "Thích"} bài đăng`}
        >
          <Icon name="heart" size={21} />
          <span>{post.likesCount}</span>
        </button>
        <button
          className={`reaction ${commentsOpen ? "active" : ""}`}
          aria-expanded={commentsOpen}
          onClick={() => setCommentsOpen(!commentsOpen)}
        >
          <Icon name="chat" size={21} />
          <span>{post.commentsCount}</span>
          <span className="action-label">Bình luận</span>
        </button>
        <button
          className={`reaction save-action ${post.saved ? "is-saved" : ""}`}
          disabled={readOnly || pending}
          onClick={save}
          aria-pressed={post.saved}
          aria-label={post.saved ? "Bỏ lưu bài đăng" : "Lưu bài đăng"}
        >
          <Icon name="bookmark" size={21} />
          <span className="action-label">
            {post.saved ? "Đã lưu" : "Lưu lại"}
          </span>
        </button>
      </footer>
      {commentsOpen && (
        <section className="comments-panel" aria-label="Bình luận">
          {commentsLoading ? (
            <p className="muted">Đang tải bình luận…</p>
          ) : comments.length ? (
            comments.map((c) => (
              <div className="comment" key={c.id}>
                <button
                  className="icon-button avatar-link"
                  onClick={() => onProfile(c.author.handle)}
                  aria-label={`Hồ sơ ${c.author.displayName}`}
                >
                  <Avatar user={c.author} size="small" />
                </button>
                <div>
                  <strong>{c.author.displayName}</strong>
                  <p>{c.body}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">
              {readOnly
                ? "Bài đăng minh hoạ chưa có bình luận."
                : "Câu chuyện bắt đầu từ một lời bình luận."}
            </p>
          )}
          {commentsError && (
            <p className="form-error" role="alert">
              {commentsError}
            </p>
          )}
          <form className="comment-form" onSubmit={comment}>
            <input
              aria-label="Viết bình luận"
              placeholder={
                readOnly
                  ? "Chỉ đọc trong bản xem trước"
                  : "Thêm một lời bình luận…"
              }
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              maxLength={1000}
              disabled={readOnly}
            />
            <button
              className="secondary-button"
              disabled={readOnly || sending || !body.trim()}
            >
              {sending ? "Đang gửi…" : "Gửi"}
            </button>
          </form>
        </section>
      )}
    </article>
  );
}

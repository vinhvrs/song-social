"use client";
import { useState } from "react";
import type { Passage, PassageMatch, Post, Track, User } from "@/lib/types";
import { api, errorMessage, mutate } from "@/lib/api";
import { Avatar, EmptyState, formatTime, Icon, Modal } from "./ui";
export type ComposerState = {
  track?: Track;
  passage?: Passage;
  mode?: "track" | "passage";
};
export function Composer({
  initial,
  user,
  tracks,
  readOnly,
  onClose,
  onAuth,
  onPublished,
  onPlay,
}: {
  initial: ComposerState;
  user: User | null;
  tracks: Track[];
  readOnly: boolean;
  onClose: () => void;
  onAuth: () => void;
  onPublished: (post: Post) => void;
  onPlay: (
    track: Track,
    passage?: Passage | null,
    onPlayed?: () => void,
  ) => void;
}) {
  const [mode, setMode] = useState(initial.mode || "track");
  const [track, setTrack] = useState<Track | undefined>(
    initial.track || initial.passage?.track,
  );
  const [passage, setPassage] = useState<Passage | undefined>(initial.passage);
  const [caption, setCaption] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PassageMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [previewed, setPreviewed] = useState<Set<string>>(new Set());
  const [trackQuery, setTrackQuery] = useState("");
  const filtered = tracks.filter((t) =>
    `${t.title} ${t.artist}`
      .toLocaleLowerCase("vi")
      .includes(trackQuery.toLocaleLowerCase("vi")),
  );
  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError("");
    setResults(null);
    if (readOnly) {
      setResults([]);
      setSearching(false);
      return;
    }
    try {
      const response = await api<{ items: PassageMatch[] }>(
        `/passages/search?q=${encodeURIComponent(query.trim())}`,
      );
      setResults(response.items);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSearching(false);
    }
  }
  async function publish() {
    if (!user) {
      onAuth();
      return;
    }
    if (!track) return;
    setPending(true);
    setError("");
    try {
      const post = await mutate<Post>("/posts", "POST", {
        caption: caption.trim(),
        trackId: track.id,
        ...(passage ? { passageId: passage.id } : {}),
      });
      onPublished(post);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal title="Chia sẻ một chút âm nhạc" onClose={onClose} wide>
      <div className="composer-author">
        <Avatar user={user} />
        <div>
          <strong>{user?.displayName || "Góc âm nhạc của bạn"}</strong>
          <span>Công khai · Cùng cộng đồng yêu nhạc</span>
        </div>
      </div>
      {readOnly && (
        <p className="preview-inline">
          <Icon name="info" size={17} />
          Bản xem trước chỉ đọc. Bài đăng chưa thể được lưu.
        </p>
      )}
      <textarea
        className="caption-input"
        aria-label="Nội dung bài đăng"
        placeholder="Bài hát này khiến bạn nghĩ đến điều gì?"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={2000}
        rows={3}
      />
      <div className="composer-tabs">
        <button
          className={mode === "track" ? "active" : ""}
          onClick={() => setMode("track")}
        >
          <Icon name="music" size={18} />
          Chọn bài hát
        </button>
        <button
          className={mode === "passage" ? "active" : ""}
          onClick={() => setMode("passage")}
        >
          <Icon name="sparkle" size={18} />
          Nói bằng nhạc
        </button>
      </div>
      {mode === "track" ? (
        <div className="track-picker">
          <label className="search-box">
            <Icon name="search" size={18} />
            <input
              aria-label="Tìm bài hát trong thư viện"
              placeholder="Tìm trong danh mục bài hát…"
              value={trackQuery}
              onChange={(e) => setTrackQuery(e.target.value)}
            />
          </label>
          <div className="picker-list">
            {filtered.length ? (
              filtered.map((t) => (
                <div
                  className={`picker-track ${track?.id === t.id ? "selected" : ""}`}
                  key={t.id}
                >
                  <button
                    className="picker-track-info"
                    onClick={() => {
                      setTrack(t);
                      setPassage(undefined);
                    }}
                  >
                    <span className="mini-art" style={{ background: t.color }}>
                      <Icon name="disc" />
                    </span>
                    <span>
                      <strong>{t.title}</strong>
                      <small>{t.artist}</small>
                    </span>
                    {track?.id === t.id && <Icon name="check" size={18} />}
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => onPlay(t)}
                    aria-label={`Nghe thử ${t.title}`}
                  >
                    <Icon name="play" size={18} />
                  </button>
                </div>
              ))
            ) : (
              <p className="muted picker-empty">
                Chưa có bài hát này trong danh mục.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="passage-search">
          <p>
            Viết điều bạn muốn nói. Tìm đúng câu hát đã được kiểm duyệt, nghe
            thử rồi chọn để chia sẻ.
          </p>
          <form className="passage-query" onSubmit={search}>
            <input
              required
              maxLength={240}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Câu bạn muốn nói bằng nhạc"
              placeholder="Nhập một câu bạn muốn nói…"
            />
            <button
              className="primary-button"
              disabled={searching || !query.trim()}
            >
              {searching ? "Đang tìm…" : "Tìm câu hát"}
            </button>
          </form>
          <small>
            Hiện tìm câu trùng khớp; chưa tự đổi cách xưng hô hay ý nghĩa.
          </small>
          {results &&
            (results.length ? (
              <div className="passage-results">
                {results.map(({ passage: p, matchType }) => (
                  <div className="passage-result" key={p.id}>
                    <span className="eyebrow">
                      {matchType === "EXACT" ? "Trùng câu" : "Trùng cụm từ"} ·{" "}
                      {formatTime(p.startMs)}–{formatTime(p.endMs)}
                    </span>
                    <blockquote>{p.text}</blockquote>
                    <p>
                      {p.track.title} · {p.track.artist}
                    </p>
                    <div className="result-actions">
                      <button
                        className="secondary-button"
                        onClick={() =>
                          onPlay(p.track, p, () =>
                            setPreviewed((current) =>
                              new Set(current).add(p.id),
                            ),
                          )
                        }
                      >
                        <Icon name="play" size={16} />
                        Nghe thử
                      </button>
                      <button
                        className="primary-button"
                        disabled={!previewed.has(p.id)}
                        onClick={() => {
                          setPassage(p);
                          setTrack(p.track);
                        }}
                      >
                        Chọn đoạn này
                      </button>
                    </div>
                    {!previewed.has(p.id) && (
                      <small>Nghe thử trước khi chọn đoạn lời.</small>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Chưa có câu hát phù hợp"
                text={
                  readOnly
                    ? "Bản xem trước chưa kết nối kho lời hát. Không có đoạn lời nào được tạo hoặc gán mốc giả."
                    : "Kho lời đã kiểm duyệt chưa có câu trùng khớp. Bạn có thể chọn một bài hát và giữ nguyên lời muốn nói trong phần nội dung."
                }
              />
            ))}
        </div>
      )}
      {track && (
        <div className="composer-selection">
          <Icon name="music" size={20} />
          <div>
            <strong>{track.title}</strong>
            <span>{passage ? `“${passage.text}”` : track.artist}</span>
          </div>
          <button
            className="icon-button"
            aria-label="Bỏ bài hát đã chọn"
            onClick={() => {
              setTrack(undefined);
              setPassage(undefined);
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <footer className="composer-footer">
        <small>{caption.length}/2000</small>
        <button
          className="primary-button"
          disabled={
            readOnly || pending || !track || (!caption.trim() && !passage)
          }
          onClick={publish}
        >
          {pending ? "Đang đăng…" : user ? "Đăng bài" : "Đăng nhập để đăng bài"}
        </button>
      </footer>
    </Modal>
  );
}

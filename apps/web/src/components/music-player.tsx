"use client";
import { useEffect, useRef, useState } from "react";
import type { Passage, Track } from "@/lib/types";
import { formatTime, Icon, Modal } from "./ui";

type YoutubePlayer = {
  loadVideoById: (options: {
    videoId: string;
    startSeconds?: number;
    endSeconds?: number;
  }) => void;
  destroy: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  pauseVideo: () => void;
};
type YoutubeApi = {
  Player: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => YoutubePlayer;
};
declare global {
  interface Window {
    YT?: YoutubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let youtubeReady: Promise<YoutubeApi> | undefined;
function loadYoutube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeReady)
    youtubeReady = new Promise<YoutubeApi>((resolve, reject) => {
      const prior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prior?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => {
        youtubeReady = undefined;
        reject(new Error("Không tải được trình phát YouTube."));
      };
      document.head.appendChild(script);
    });
  return youtubeReady;
}
export function MusicPlayer({
  track,
  passage,
  onClose,
  onPlayed,
}: {
  track: Track;
  passage?: Passage | null;
  onClose: () => void;
  onPlayed?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onPlayedRef = useRef(onPlayed);
  onPlayedRef.current = onPlayed;
  const player = useRef<YoutubePlayer | null>(null);
  const [notice, setNotice] = useState("Đang mở trình phát YouTube…");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let previewReported = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      if (!disposed)
        setNotice(
          "Nếu trình phát chưa xuất hiện, bạn có thể mở bài hát trên YouTube.",
        );
    }, 10000);
    loadYoutube()
      .then((YT) => {
        if (disposed || !host.current) return;
        const element = document.createElement("div");
        host.current.appendChild(element);
        player.current = new YT.Player(element, {
          width: "100%",
          height: "100%",
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            playsinline: 1,
            controls: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (disposed) return;
              clearTimeout(timeout);
              setReady(true);
              setNotice(
                "Nhấn phát trong khung YouTube nếu trình duyệt chưa bắt đầu.",
              );
              player.current?.loadVideoById({
                videoId: track.youtubeId,
                ...(passage
                  ? {
                      startSeconds: passage.startMs / 1000,
                      endSeconds: passage.endMs / 1000,
                    }
                  : {}),
              });
              if (passage)
                interval = setInterval(() => {
                  if (!player.current) return;
                  const seconds = player.current.getCurrentTime();
                  if (seconds >= passage.endMs / 1000)
                    player.current.pauseVideo();
                  else if (
                    seconds >= passage.startMs / 1000 &&
                    player.current.getPlayerState() === 1 &&
                    !previewReported
                  ) {
                    previewReported = true;
                    onPlayedRef.current?.();
                  }
                }, 200);
            },
            onStateChange: (event: { data: number }) => {
              if (event.data === 1 && !disposed && !passage)
                onPlayedRef.current?.();
            },
            onError: () => {
              if (!disposed)
                setNotice(
                  "Video này không phát được trong khung nhúng. Bạn có thể mở trên YouTube.",
                );
            },
            onAutoplayBlocked: () => {
              if (!disposed)
                setNotice("Nhấn nút phát trong khung YouTube để bắt đầu nghe.");
            },
          },
        });
      })
      .catch((error) => {
        if (!disposed) setNotice(error.message);
      });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      clearInterval(interval);
      player.current?.destroy();
      player.current = null;
    };
  }, [track.youtubeId, passage]);
  function replay() {
    player.current?.loadVideoById({
      videoId: track.youtubeId,
      ...(passage
        ? {
            startSeconds: passage.startMs / 1000,
            endSeconds: passage.endMs / 1000,
          }
        : {}),
    });
  }
  return (
    <Modal
      title={passage ? "Nghe đoạn lời đã chọn" : "Cùng nghe một bài nhạc"}
      onClose={onClose}
      wide
    >
      <div className="player-container" ref={host} />
      <div className="player-details">
        <div>
          <h3>{track.title}</h3>
          <p>{track.artist}</p>
        </div>
        {ready && (
          <button className="secondary-button" onClick={replay}>
            <Icon name="play" size={17} />
            Nghe lại
          </button>
        )}
      </div>
      {passage && (
        <div className="selected-lyric">
          <span className="eyebrow">
            Lời đã kiểm duyệt · {formatTime(passage.startMs)}–
            {formatTime(passage.endMs)}
          </span>
          <blockquote>{passage.text}</blockquote>
          <small>
            Mốc phát trên YouTube có thể lệch nhẹ. Hãy nghe kiểm tra trước khi
            chia sẻ.
          </small>
        </div>
      )}
      <p className="player-notice" role="status">
        {notice}
      </p>
      <a
        className="text-link player-source"
        href={`https://www.youtube.com/watch?v=${track.youtubeId}${passage ? `&t=${Math.floor(passage.startMs / 1000)}` : ""}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Mở nguồn trên YouTube
      </a>
    </Modal>
  );
}

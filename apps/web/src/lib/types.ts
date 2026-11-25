export interface User {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarColor: string;
  followersCount: number;
  followingCount: number;
  following: boolean;
}
export interface Track {
  id: string;
  title: string;
  artist: string;
  youtubeId: string;
  genre: string;
  color: string;
}
export interface Passage {
  id: string;
  track: Track;
  text: string;
  language: string;
  startMs: number;
  endMs: number;
  verification: "REVIEWED";
}
export interface Post {
  id: string;
  author: User;
  caption: string;
  track: Track;
  passage: Passage | null;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  liked: boolean;
  saved: boolean;
}
export interface Comment {
  id: string;
  author: User;
  body: string;
  createdAt: string;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface PassageMatch {
  passage: Passage;
  matchType: "EXACT" | "PHRASE";
  score: number;
}
export type View = "feed" | "discover" | "library" | "profile";

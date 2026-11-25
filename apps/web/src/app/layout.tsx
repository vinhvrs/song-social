import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  icons: { icon: "/icon.svg" },
  title: "Song Social — Mỗi giai điệu, một kết nối",
  description:
    "Mạng xã hội của những người yêu nhạc. Chia sẻ bài hát, khám phá gu nhạc và tìm câu hát để nói điều bạn muốn nói.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

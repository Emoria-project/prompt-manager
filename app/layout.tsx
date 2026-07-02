import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "プロンプト管理",
  description: "LocalStorageで動作するプロンプト管理Webアプリ"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

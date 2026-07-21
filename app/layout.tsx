import type { Metadata, Viewport } from "next";
import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    title: "Aria 监盘｜A 股真实数据监控与复盘",
    description: "只使用真实 A 股行情数据展示主要指数、关注股票、预警与历史复盘。",
    applicationName: "Aria 监盘",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Aria 监盘",
    },
    openGraph: {
      title: "Aria 监盘",
      description: "A 股真实数据监控与复盘",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Aria 监盘",
      description: "A 股真实数据监控与复盘",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3f4ee",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

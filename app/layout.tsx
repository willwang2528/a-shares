import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    title: "盘面守望｜A 股风险提醒与每日复盘",
    description: "给普通用户的 A 股盘面风险提醒、任务设置、成本评估和每日复盘工具。",
    applicationName: "盘面守望",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "盘面守望",
    },
    openGraph: {
      title: "盘面守望",
      description: "A 股风险提醒与每日复盘",
      images: [{ url: `${origin}/og.png`, width: 1536, height: 1024, alt: "盘面守望产品预览" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "盘面守望",
      description: "A 股风险提醒与每日复盘",
      images: [`${origin}/og.png`],
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

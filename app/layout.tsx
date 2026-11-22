import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";

const TITLE = "AdUnity — Telegram Mini App";
const DESCRIPTION =
  "AdUnity is a Telegram Mini App for sharing invites and earning a 25% share of verified referral ad revenue.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "AdUnity",
  keywords: ["Telegram", "Mini App", "advertising", "rewards", "referral"],
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    siteName: "AdUnity",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#06070b",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    /* `suppressHydrationWarning` is deliberate and load-bearing here.
       telegram-web-app.js runs before hydration and writes
       `--tg-viewport-height` / `--tg-viewport-stable-height` onto
       <html style>, so the live element stops matching the serialised
       HTML by the time React compares them. Browser extensions inject
       attributes the same way — Grammarly puts its `data-gr-*` flags on
       <html>, others stamp `cz-shortcut-listen` on <body>. These are
       attribute-only differences that React cannot patch and must not
       warn about. These flags are scoped to their own element, so a
       genuine mismatch anywhere in the tree still surfaces normally. */
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className="min-h-dvh bg-background text-foreground antialiased"
        suppressHydrationWarning
      >
        {/* The SDK must exist before any app module runs (beforeInteractive),
            so the mount effect can read initData synchronously and paint the
            real user instead of a placeholder. */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  );
}

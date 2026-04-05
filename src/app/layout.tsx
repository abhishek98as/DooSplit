import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#00B8A9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export const metadata: Metadata = {
  applicationName: "DooSplit",
  title: "DooSplit - Share Expenses with Friends",
  description: "Track and split expenses with friends and roommates. Manage group finances efficiently with DooSplit.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DooSplit",
    startupImage: [
      // iPhone 15 Pro Max / 16 Pro Max (430px wide)
      {
        url: "/api/pwa/icon?size=512",
        media:
          "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      // iPhone 15 / 15 Pro / 16 (393px wide)
      {
        url: "/api/pwa/icon?size=512",
        media:
          "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      // iPhone 14 Plus / 13 Pro Max (428px)
      {
        url: "/api/pwa/icon?size=512",
        media:
          "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      // iPhone 14 / 13 Pro / 12 Pro (390px)
      {
        url: "/api/pwa/icon?size=512",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      // iPhone SE 3rd gen / 8 (375x667)
      {
        url: "/api/pwa/icon?size=384",
        media:
          "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      // iPad Pro 12.9-inch 6th gen (1024x1366)
      {
        url: "/api/pwa/icon?size=512",
        media:
          "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      // iPad Pro 11-inch / iPad Air 5th gen (834x1194)
      {
        url: "/api/pwa/icon?size=512",
        media:
          "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      // iPad mini 6th gen (744x1133)
      {
        url: "/api/pwa/icon?size=384",
        media:
          "(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
    ],
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/api/pwa/icon?size=32", sizes: "32x32", type: "image/png" },
      { url: "/api/pwa/icon?size=96", sizes: "96x96", type: "image/png" },
      { url: "/api/pwa/icon?size=192", sizes: "192x192", type: "image/png" },
      { url: "/api/pwa/icon?size=512", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/api/pwa/icon?size=192",
    apple: [
      { url: "/api/pwa/icon?size=72", sizes: "72x72", type: "image/png" },
      { url: "/api/pwa/icon?size=96", sizes: "96x96", type: "image/png" },
      { url: "/api/pwa/icon?size=128", sizes: "128x128", type: "image/png" },
      { url: "/api/pwa/icon?size=144", sizes: "144x144", type: "image/png" },
      { url: "/api/pwa/icon?size=152", sizes: "152x152", type: "image/png" },
      { url: "/api/pwa/icon?size=180", sizes: "180x180", type: "image/png" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "DooSplit",
    "msapplication-TileColor": "#00B8A9",
    "msapplication-tap-highlight": "no",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Android Chrome PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
        {/* iOS Safari PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="DooSplit" />
        {/* Apple touch icons — explicit link tags for maximum iOS compatibility */}
        <link rel="apple-touch-icon" href="/api/pwa/icon?size=180" />
        <link rel="apple-touch-icon" sizes="152x152" href="/api/pwa/icon?size=152" />
        <link rel="apple-touch-icon" sizes="144x144" href="/api/pwa/icon?size=144" />
        <link rel="apple-touch-icon" sizes="128x128" href="/api/pwa/icon?size=128" />
        <link rel="apple-touch-icon" sizes="96x96" href="/api/pwa/icon?size=96" />
        <link rel="apple-touch-icon" sizes="72x72" href="/api/pwa/icon?size=72" />
        {/* Microsoft */}
        <meta name="msapplication-TileColor" content="#00B8A9" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body className={`${inter.variable} font-sans`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

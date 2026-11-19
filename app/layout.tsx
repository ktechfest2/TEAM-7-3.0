import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { FinalizePrompt } from "@/components/FinalizePrompt";
import { Footer } from "@/components/Footer";
import { Preloader } from "@/components/Preloader";
import { SyncManager } from "@/components/SyncManager";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], axes: ["opsz", "wdth"] });

export const metadata: Metadata = {
  title: "CounTrack",
  description: "Turn photos of polling-unit result sheets into tamper-evident evidence.",
  appleWebApp: { capable: true, title: "CounTrack", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0c2418" },
    { media: "(prefers-color-scheme: dark)", color: "#050d08" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Preloader />
        <AppHeader />
        <SyncManager />
        <FinalizePrompt />
        <main className="flex w-full flex-1 flex-col">{children}</main>
        <Footer />
        <Suspense>
          <BottomNav />
        </Suspense>
      </body>
    </html>
  );
}

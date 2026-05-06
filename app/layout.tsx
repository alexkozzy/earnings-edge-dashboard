import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { NavTabs } from "@/components/NavTabs";
import { Footer } from "@/components/Footer";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Earnings Edge Dashboard",
  description:
    "Public read-only view of earnings prediction-market mispricing signals and historical calibration.",
  applicationName: "Earnings Edge",
  authors: [{ name: "Alex Kozlov" }],
  keywords: [
    "earnings",
    "prediction markets",
    "Polymarket",
    "Kalshi",
    "EPS",
    "calibration",
    "mispricing",
  ],
  openGraph: {
    type: "website",
    title: "Earnings Edge Dashboard",
    description:
      "Mispricing signals on prediction-market earnings questions, with calibration tracked over time.",
    siteName: "Earnings Edge",
  },
  twitter: {
    card: "summary",
    title: "Earnings Edge Dashboard",
    description:
      "Mispricing signals on prediction-market earnings questions, with calibration tracked over time.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <header className="border-b border-[var(--border)] bg-[var(--panel)]">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
            <Link href="/" className="flex shrink-0 items-baseline gap-2 sm:gap-3">
              <span className="whitespace-nowrap text-base font-semibold tracking-tight sm:text-lg">
                Earnings Edge
              </span>
              <span className="hidden text-xs uppercase tracking-widest text-[var(--muted)] sm:inline">
                Dashboard
              </span>
            </Link>
            <NavTabs />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
        <Footer />
        <KeyboardShortcuts />
      </body>
    </html>
  );
}

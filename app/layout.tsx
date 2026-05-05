import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { NavTabs } from "@/components/NavTabs";

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
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <Link href="/" className="flex items-baseline gap-3">
              <span className="text-lg font-semibold tracking-tight">
                Earnings Edge
              </span>
              <span className="hidden text-xs uppercase tracking-widest text-[var(--muted)] sm:inline">
                Dashboard
              </span>
            </Link>
            <NavTabs />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
        <footer className="border-t border-[var(--border)] bg-[var(--panel)]">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-[var(--muted)] sm:px-6">
            Read-only. Not investment advice. Signals are produced by the
            scanner project; this site only visualizes the published snapshot.
          </div>
        </footer>
      </body>
    </html>
  );
}

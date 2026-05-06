/**
 * TickerLogo — 40×40 rounded-square logo via Clearbit, with a graceful
 * initials fallback when the ticker isn't in our domain map or Clearbit
 * doesn't know the brand.
 *
 * We don't use next/image here because Clearbit responses are tiny
 * (typically 4–10KB) and the responsive layout doesn't benefit from
 * Next's image pipeline. Plain <img> avoids the remotePatterns config
 * burden if a new ticker shows up.
 */
"use client";

import { useState } from "react";
import { colorForTicker, domainForTicker } from "@/lib/tickerDomains";

export function TickerLogo({
  ticker,
  size = 40,
}: {
  ticker: string;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  const domain = domainForTicker(ticker);
  const showImg = domain && !errored;

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://logo.clearbit.com/${domain}`}
        alt={`${ticker} logo`}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setErrored(true)}
        className="rounded-md object-contain bg-white/5"
        style={{ width: size, height: size }}
      />
    );
  }

  // Fallback: colored square with the first 1–2 chars of the ticker.
  const initials = ticker.slice(0, ticker.length <= 2 ? 1 : 2).toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-md font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: colorForTicker(ticker),
        fontSize: size * 0.4,
      }}
      aria-label={`${ticker} (no logo)`}
    >
      {initials}
    </div>
  );
}

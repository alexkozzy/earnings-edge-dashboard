/**
 * Ticker → primary brand domain map for Clearbit Logo lookups.
 *
 * Add as you encounter new tickers. Unknown tickers fall back to
 * a colored circle with the ticker initials (see TickerLogo).
 */
export const TICKER_DOMAINS: Record<string, string> = {
  // Mega-cap tech
  AAPL: "apple.com",
  MSFT: "microsoft.com",
  GOOGL: "google.com",
  GOOG: "google.com",
  AMZN: "amazon.com",
  META: "meta.com",
  NVDA: "nvidia.com",
  TSLA: "tesla.com",

  // Semis
  AMD: "amd.com",
  INTC: "intel.com",
  TSM: "tsmc.com",
  AVGO: "broadcom.com",
  MU: "micron.com",
  QCOM: "qualcomm.com",

  // SaaS / Software
  CRM: "salesforce.com",
  ORCL: "oracle.com",
  ADBE: "adobe.com",
  NOW: "servicenow.com",
  PLTR: "palantir.com",
  SHOP: "shopify.com",
  SNOW: "snowflake.com",
  DDOG: "datadoghq.com",

  // Banks / Finance
  JPM: "jpmorganchase.com",
  BAC: "bankofamerica.com",
  WFC: "wellsfargo.com",
  GS: "goldmansachs.com",
  MS: "morganstanley.com",
  C: "citi.com",
  BLK: "blackrock.com",
  SCHW: "schwab.com",
  V: "visa.com",
  MA: "mastercard.com",
  PYPL: "paypal.com",
  AXP: "americanexpress.com",
  MTB: "mtb.com",

  // Consumer
  NFLX: "netflix.com",
  DIS: "disney.com",
  COST: "costco.com",
  WMT: "walmart.com",
  HD: "homedepot.com",
  NKE: "nike.com",
  SBUX: "starbucks.com",
  MCD: "mcdonalds.com",
  KO: "coca-colacompany.com",
  PEP: "pepsico.com",

  // Energy
  XOM: "exxonmobil.com",
  CVX: "chevron.com",
  COP: "conocophillips.com",

  // Healthcare / Pharma
  JNJ: "jnj.com",
  PFE: "pfizer.com",
  LLY: "lilly.com",
  UNH: "unitedhealthgroup.com",
  ABBV: "abbvie.com",
  MRK: "merck.com",

  // Industrials
  BA: "boeing.com",
  CAT: "caterpillar.com",
  GE: "ge.com",
  HON: "honeywell.com",
  RTX: "rtx.com",
  LMT: "lockheedmartin.com",
};

/** Lookup with case-insensitive match. */
export function domainForTicker(ticker: string): string | undefined {
  return TICKER_DOMAINS[ticker.toUpperCase()];
}

/** Stable color for the fallback initial-circle, derived from the ticker. */
export function colorForTicker(ticker: string): string {
  const palette = [
    "#10B981", // green
    "#3B82F6", // blue
    "#F59E0B", // amber
    "#EC4899", // pink
    "#8B5CF6", // violet
    "#06B6D4", // cyan
    "#84CC16", // lime
    "#F97316", // orange
    "#EF4444", // red
  ];
  let h = 0;
  for (let i = 0; i < ticker.length; i += 1) {
    h = (h * 31 + ticker.charCodeAt(i)) % 1_000_003;
  }
  return palette[h % palette.length];
}

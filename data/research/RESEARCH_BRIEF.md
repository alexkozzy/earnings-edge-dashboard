# Research session brief — shared context for all subagents

**Working dir:** `/Users/alexkozlov/Dropbox/claude shenanigans/earnings-edge-dashboard/`

**Session goal:** real backtest of an earnings-mispricing strategy on resolved Polymarket markets.

## Verified facts (orchestrator pre-flight)

### Polymarket data — confirmed available

- **Endpoint:** `https://gamma-api.polymarket.com/events?tag_slug=earnings&closed=true&limit=200&offset=N`
  - **Critical:** `tag_slug=earnings` is required; without it earnings markets are buried in unrelated noise (sports, politics).
- **Total resolved earnings markets:** 856
- **Unique tickers:** 420
- **Date range:** 2024-01-19 → 2026-05-06 (~8 quarters)
- **Top tickers (3 quarters each):** GIS, FDS, FDX, MU, ACN, KMX, NKE, XOM, PEP, DAL, JPM, WFC, GS, C, DPZ
- **Pre-saved snapshot:** `data/research/earnings_markets_raw.json` (all 856 markets, with `condition_id`, `clob_token_ids_raw`, `outcomes_raw`, `outcome_prices_raw`, `end_date`, `ticker`)

### Question pattern — corrected

The original prompt assumed `r"Will (.+?) \(([A-Z]{1,5})\) beat quarterly earnings"`. **That regex matches zero markets.** Actual pattern is:

> `"Will <Company Name> (<TICKER>) beat its quarterly EPS estimate?"`

Use this regex to extract the ticker:
```python
import re
TICKER_RE = re.compile(r"\(([A-Z]{1,5})\)")
ticker = TICKER_RE.search(question).group(1) if TICKER_RE.search(question) else None
```

### CLOB historical prices — confirmed available

- **Endpoint:** `https://clob.polymarket.com/prices-history?market=<YES_TOKEN_ID>&interval=max&fidelity=720`
- `fidelity=720` is minutes per bucket (12h). Other valid values: 60, 360, 1440 (1d).
- **Returns:** `{"history": [{"t": <unix_seconds>, "p": <float 0..1>}, ...]}`
- **Token ID:** `clob_token_ids_raw` is a JSON-encoded string `'["yes_token_id","no_token_id"]'`. Parse with `json.loads()`. **Yes-token is index 0.**

### Trading-window characteristics (sample of 20)

- Median window: 8.2 days; mean 10.6; min 3.5; max 40
- All 20 sampled had ≥3.5d (so T-3d entry is universally viable)
- 11/20 had ≥7d (so T-7d entry works for ~half)
- Median 15 price points per market

### Outcome resolution

- `outcome_prices_raw` is a JSON-encoded string `'["1","0"]'` or `'["0","1"]'`
- `["1","0"]` = **beat** (Yes won, payoff $1.00 to Yes holders)
- `["0","1"]` = **miss** (No won, payoff $1.00 to No holders)
- `outcomes_raw` is always `'["Yes","No"]'`; check just `outcome_prices_raw[0]`

## API keys — what's available locally

`.env.research` (in dashboard root) was pulled from Vercel. Source it like:
```python
with open('.env.research') as f:
    for line in f:
        if '=' not in line or line.startswith('#'): continue
        k, v = line.strip().split('=', 1)
        os.environ[k] = v.strip('"')
```

| Key | Status | Use |
|---|---|---|
| `ALPHA_VANTAGE_API_KEY` | ✅ populated | EARNINGS, OVERVIEW. **HARD CAP 20 calls/day.** |
| `FINNHUB_API_KEY` | ❌ empty (Sensitive classification — STATE.md gotcha) | Cannot use locally |
| `SNAPSHOT_BASE_URL` | ✅ populated | https://alexkozzy.github.io/earnings-edge-data/data |
| `CRON_SECRET`, `DIAG_TOKEN`, `GH_DATA_PAT` | ❌ empty (Sensitive) | Not needed for research |

**Substitution: use Alpha Vantage `EARNINGS` for EPS history.**
```
https://www.alphavantage.co/query?function=EARNINGS&symbol=<TICKER>&apikey=<KEY>
```
Returns `quarterlyEarnings` array with `fiscalDateEnding`, `reportedDate`, `reportedEPS`, `estimatedEPS`, `surprise`, `surprisePercentage`. ~5 years of history. **One call per ticker.**

For sector/industry: hardcode a small lookup for the top ~20 tickers from common knowledge (AAPL→Tech, JPM→Banks, NVDA→Semis, etc.) rather than burning AV calls on `OVERVIEW`. Document the lookup in your output.

## Hard rules

1. **Walk-forward only.** When fitting features for a bet at quarter Q, only use data from quarters strictly less than Q.
2. **AV budget is 20 calls — total across all agents.** Track in `data/research/av_quota.json`. If you would exceed, stop and report.
3. **No deploys, no scanner edits, no paper-trading code edits.** Research output goes to `docs/research/` only.
4. **Don't fake data.** If something can't be computed, say so — don't fabricate.
5. **Honest N reporting.** "67% win rate on N=42" is the format; never bare percentages without sample size.

## Output convention

- All MD files → `docs/research/`
- All raw data → `data/research/`
- Charts → `docs/research/*.png`
- Quota tracker → `data/research/av_quota.json`

## Hand-off between agents

- **A produces:** `data/research/training_data.parquet`, `data/research/model.pkl`, `docs/research/MODEL_FIT.md`. Also annotates `data/research/earnings_markets_with_entry.jsonl` (with `entry_yes_price`, `entry_no_price`, `outcome_beat`, `model_p_beat` — one row per market).
- **B reads:** A's outputs, simulates 6 strategies. Writes `docs/research/BACKTEST_RESULTS.md` + per-strategy P&L CSVs to `data/research/`.
- **C reads:** A's `training_data.parquet`. Writes `docs/research/CORRELATION_AND_PORTFOLIO.md` + `data/research/sector_correlation_matrix.json`.
- **D is independent.** Reads STATE.md and the bounded vault paths. Writes `docs/research/ALTERNATIVES.md`.

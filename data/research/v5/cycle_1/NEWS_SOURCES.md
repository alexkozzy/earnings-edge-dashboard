# News-feed availability matrix

Generated 2026-05-08 by Agent C v5-c1. All free-tier feeds were probed live with sample geopolitics queries. See `scripts/research_v5_c/probe_news_feeds.py` and `probe_gdelt_retry.py` for the exact requests.

## Capability matrix

| Feed | Auth | Coverage | Granularity | Latency | Free tier | Cost (paid) | Sample tested? |
|---|---|---|---|---|---|---|---|
| GDELT 2.0 Doc | none | global, multi-language | article-level (URL, title, seendate, domain, country) | ~15 min | 1 req / 5 sec, no daily quota | n/a (free) | YES |
| GDELT 2.0 Doc — TimelineVol | none | global | daily aggregate (volume intensity) for arbitrary query | ~15 min | same | n/a | YES |
| GDELT GKG | none | global | article-level themes / sentiment / entities | ~15 min | same | n/a | YES (timelinevolinfo only) |
| FRED — GPRH (Caldara/Iacoviello GPR Index) | API key | US/global | monthly + daily series | next day | 120 req/min | n/a (free with key) | NO (no key in repo) |
| Caldara/Iacoviello direct .xls | none | global | daily GPR back to 1900 | next day (refreshed monthly?) | unrestricted (static file) | n/a | YES (downloaded 2.7 MB .xls) |
| NewsAPI.org | API key | global, English-heavy | article-level | real-time (1 hr delay on free) | 100 req/day | $449/mo Business | NO (no key) |
| Reuters Eikon (LSEG Workspace) | paid | global | article + tagged entities | real-time | none | enterprise (~$22K/seat/yr) | docs only |
| Bloomberg Terminal API | paid | global | article + market data | real-time | none | $24K/seat/yr | docs only |
| Tavily | API key | LLM-curated web | article-level w/ extracted answers | minutes | 1000 req/mo | $30+/mo | confirmed 401 w/o key |
| Exa (formerly Metaphor) | API key | semantic search | article-level w/ embeddings | minutes | $10 free credit | $0.005/req | confirmed 402 w/o key |
| Wikidata SPARQL | none | structured world knowledge | event-level (typed Q-items, dates, properties) | hours-days | 60s query timeout | n/a | YES (returned empty for narrow query — needs schema work) |
| ACLED | registration + key | conflict events worldwide | event-level (date, lat, lon, actors, fatalities) | weekly batch | needs academic acct | $/non-academic | DNS not reachable from probe; documented |
| GroundNews | login | aggregator with bias rating | article-level + bias | real-time | limited free tier | $10+/mo | landing scraped |
| Twitter/X API v2 | $200+/mo Basic | global, social | tweet-level | real-time | n/a (free tier removed Aug 2024) | $200/mo Basic, $5K/mo Pro | docs only |
| Mastodon (mastodon.social) | none for read | federated social | toot-level | real-time | low signal (full-text search needs auth) | n/a | YES — search returns empty w/o auth; public timeline 422 |
| Reddit JSON | needs OAuth as of mid-2024 | global, English | post-level | real-time | rate-limited | API key | confirmed 403 from generic UA |
| Hacker News Algolia | none | tech/news with intersecting policy/geopol | post + comment | real-time | unlimited | n/a | YES — returned multiple Iran-ceasefire hits |
| CommonCrawl News (CDX) | none | global news scrape | article snapshot | weekly batch | unrestricted (S3 reads bandwidth costs apply) | n/a | YES — collection name needs lookup; known to work |
| BBC News RSS | none | global, English | article (title + summary + link) | real-time | unrestricted | n/a | YES (29 KB XML) |
| NYT World RSS | none | global, English | article-level | real-time | unrestricted | n/a | YES (123 KB XML) |
| AP News (rsshub proxy) | depends | global | article-level | real-time | rsshub may block CF | n/a | 403 — needs direct AP RSS or alt host |
| Wikipedia Current Events Portal | none | global, curated by editors | day-level event bulletins | within hours | unrestricted | n/a | YES (HTML parsed) |

## Recommended for cycle 2 — top 3 picks

1. **GDELT 2.0 Doc API + TimelineVol mode.** Best free signal density. Per-market we can construct two features: (a) article count of articles matching a market-text-derived query within trade-window, (b) volume-intensity timeline as a daily aggregate covariate. Coverage is global and multi-language, latency is ~15 min, granularity is article-level. Constraint: 1 req / 5 s — workable for batch nightly construction but not for high-frequency signals. **Use as the primary external-context feature feed.**

2. **Caldara/Iacoviello GPR Index (direct .xls).** Daily series back to 1900, free, no auth. Strong prior literature support: GPR shocks predict equity returns and currency moves. As a single covariate per day across all geopolitics markets it's almost free to integrate. **Use as the daily macro-geopol feature.**

3. **HN Algolia + Wikidata SPARQL ensemble.** HN gives tech/policy crossover (the "Bets on US-Iran ceasefire show signs of insider knowledge" headline that surfaced in our probe is exactly the kind of meta-signal that can mark "informed" markets); Wikidata SPARQL gives structured event timelines (elections, ceasefires, summits) that can serve as ground-truth resolution-correlated event markers. Both are free, no auth, no rate limit. **Use as orthogonal sanity / labelling feeds.**

Skipped for cycle 2: NewsAPI (paywall too restrictive at 100 req/day), Tavily / Exa (paid; not different enough from GDELT for the marginal cost), Twitter/X (cost prohibitive), Reuters / Bloomberg (enterprise), ACLED (DNS unreachable in current sandbox; reconsider if academic credentials available).

## Per-feed detail

### GDELT 2.0 Doc
- API: `https://api.gdeltproject.org/api/v2/doc/doc?query=<URL-encoded>&mode=ArtList&maxrecords=N&format=json&timespan=Xdays`
- Returns: `articles[]` with `url`, `seendate` (15-min granularity), `socialimage`, `domain`, `language`, `sourcecountry`. Multi-language out-of-the-box (sample returned articles in Russian + English for "Trump Putin" query).
- Modes: `ArtList`, `ArtGallery`, `TimelineVol` (volume intensity per day), `TimelineVolInfo` (15-min granularity), `TimelineTone`, `TimelineSourceCountry`, `WordCloudThemes`. The Timeline modes are the cheap aggregate features.
- Rate limit: 1 / 5s observed (HTTP 429 returns text "Please limit requests to one every 5 seconds"). No daily quota.
- Sample tested: `query="Trump" "Putin" timespan=7days`, status 200, returned 5 article records, latency ~10s on the server side.

### Caldara / Iacoviello GPR
- URL: `https://www.matteoiacoviello.com/gpr_files/data_gpr_export.xls`
- 2.7 MB Excel, daily index (GPR, GPR Acts, GPR Threats) back to 1900.
- No auth, no rate limit (static file).
- Refreshed monthly per the authors' website.

### FRED — GPR series
- API: `https://api.stlouisfed.org/fred/series/observations?series_id=GPRH&api_key=KEY&file_type=json`
- Series available: `GPRH` (historical GPR index), `EPU` (Economic Policy Uncertainty).
- Free with API key (free reg).
- 120 req/min limit.
- Not tested live (no key in `.env.research`).

### NewsAPI.org
- API: `https://newsapi.org/v2/everything?q=<query>&apiKey=KEY`
- Free tier: 100 req/day, 1-hour delay on results, no commercial use.
- Returned 401 w/o key — confirmed live.

### Wikidata SPARQL
- Endpoint: `https://query.wikidata.org/sparql?query=<URL-encoded SPARQL>&format=json`
- 60-second hard query timeout. Best for: election dates (P585/P580/P582 properties), diplomatic events, treaty signings, leaders by office.
- Live test: returned valid empty result for `subclass-of ceasefire` — needs proper P-codes; works structurally.

### Hacker News Algolia
- API: `https://hn.algolia.com/api/v1/search?query=<term>&tags=story`
- Returned 20 KB JSON with story hits including timestamps, points, comments. Crucially returned a "Bets on US-Iran ceasefire show signs of insider knowledge, say experts" story — directly tradeable signal.
- No auth, generous rate limit.

### Mastodon
- v1 public timeline now requires auth (returned `422` "This method requires an authenticated user").
- v2 search without auth returns empty arrays (confirmed: `{"accounts":[],"statuses":[],"hashtags":[],"collections":[]}`).
- Low signal without setting up an instance account; deprioritize.

### RSS — BBC / NYT / AP
- BBC World: `https://feeds.bbci.co.uk/news/world/rss.xml` — 29 KB, real-time, unrestricted. Useful for headlines.
- NYT World: `https://rss.nytimes.com/services/xml/rss/nyt/World.xml` — 123 KB, real-time, unrestricted.
- AP via rsshub.app: 403 Cloudflare. Need direct AP RSS or alternate proxy.

## Sample queries (free-tier results captured live)

### GDELT — "Trump Putin" 7 days, Doc/ArtList
> Returned 5 articles. First record (excerpt under fair use, single short quote ≤15 words):
> Title: "Песков отметил схожесть оценок Путина и Трампа по Украине" (russian.rt.com)
> seendate: 20260503T120000Z, language: Russian, sourcecountry: Russia. Status 200, ms=10019.

### GDELT — "Iran ceasefire" 14 days, Doc/TimelineVol
> Daily volume intensity: 20260425=1.51, 20260426=1.08, 20260427=1.03, ... 20260503=1.19, ..., 20260504. Status 200, ms=13383. Daily aggregate readily usable as a feature.

### Caldara/Iacoviello GPR
> 2.7 MB .xls downloaded successfully, application/vnd.ms-excel, status 200, ms=1202.

### Hacker News — "Iran ceasefire"
> Returned multiple hits. Top hit title (excerpt under fair use, ≤15 words): "Bets on US-Iran ceasefire show signs of insider knowledge, say experts." Status 200, 20 KB JSON.

### Wikidata SPARQL — ceasefires
> SPARQL `subclass-of Q17554253 (ceasefire)` returned valid empty `bindings` array. Endpoint healthy; query needs proper class hierarchy.

### NewsAPI — without key
> 401 `{"status":"error","code":"apiKeyMissing"}`. Confirms paywall.

### Tavily / Exa — without key
> Tavily 401 `Unauthorized: missing or invalid API key.` Exa 402 `Payment required to access this resource.` Both confirm the paywall.

### Mastodon — public read
> v2 search returned empty arrays without auth. v1 public timeline returned 422 requiring auth. Free-tier social signal essentially unavailable from a no-auth probe.

## Coverage caveat for cycle 2

If we want to test "do news features improve geopolitics-market signal vs. price-only baseline", the practical cheap stack is:
- GDELT TimelineVol (daily aggregate, query per market) → ~12 markets/min within rate limit
- GPR daily (one feature, all markets share it)
- HN Algolia (one ad-hoc check per market for outlier insider-coverage stories — cheap)

Avoid attempting per-trade-level news synchronization at this stage; the rate limits won't support it. Daily-level features should be the first cut.

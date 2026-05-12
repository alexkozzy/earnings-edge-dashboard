#!/usr/bin/env python3
"""
Agent C v5-c1 — News feed availability probe.

Tests free-tier news feeds with sample geopolitics queries.
Prints per-feed: status, latency, granularity, response excerpt.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

UA = "Mozilla/5.0 (research-v5-c1)"
TIMEOUT = 15

def fetch(url, headers=None, label=""):
    headers = headers or {}
    headers.setdefault("User-Agent", UA)
    req = urllib.request.Request(url, headers=headers)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = r.read()
            ct = r.headers.get("Content-Type", "")
            elapsed = time.time() - t0
            return {"ok": True, "status": r.status, "ms": int(elapsed * 1000),
                    "content_type": ct, "len": len(data), "body": data}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "err": str(e), "body": e.read() if e.fp else b""}
    except Exception as e:
        return {"ok": False, "err": str(e)}

def show(label, res, excerpt_len=400):
    print(f"\n=== {label} ===")
    if res.get("ok"):
        print(f"  status={res['status']} ms={res['ms']} bytes={res['len']} ctype={res['content_type']}")
        body = res["body"]
        try:
            txt = body.decode("utf-8", errors="replace")
        except Exception:
            txt = repr(body[:200])
        print(f"  EXCERPT[{excerpt_len}]: {txt[:excerpt_len]}")
    else:
        print(f"  FAIL status={res.get('status')} err={res.get('err')}")
        if res.get("body"):
            print(f"  body[200]={res['body'][:200]!r}")

def main():
    print(f"# news-feed probe @ {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")

    # 1. GDELT 2.0 Doc API — articles
    q = urllib.parse.quote('"Iran ceasefire"')
    url = f"https://api.gdeltproject.org/api/v2/doc/doc?query={q}&mode=ArtList&maxrecords=5&format=json&timespan=14days"
    show("GDELT 2.0 Doc — Iran ceasefire (last 14d)", fetch(url))

    q = urllib.parse.quote('"Trump Putin"')
    url = f"https://api.gdeltproject.org/api/v2/doc/doc?query={q}&mode=ArtList&maxrecords=5&format=json&timespan=7days"
    show("GDELT 2.0 Doc — Trump Putin (last 7d)", fetch(url))

    # 2. GDELT 2.0 GKG — themes
    url = "https://api.gdeltproject.org/api/v2/doc/doc?query=domain:reuters.com%20theme:GENERAL_GOVERNMENT&mode=TimelineVolInfo&format=json&timespan=3days"
    show("GDELT 2.0 GKG/timelinevolinfo — Reuters general gov", fetch(url))

    # 3. FRED — Geopolitical Risk Index (Caldara/Iacoviello). Try without API key (public endpoint requires key, but GeoPolRisk is on Caldara's site). Try fred without key first.
    url = "https://api.stlouisfed.org/fred/series/observations?series_id=GPRH&file_type=json&observation_start=2026-01-01"
    show("FRED — GPRH (no key, expected to fail without API key)", fetch(url))

    # 4. Caldara Iacoviello GPR direct (public CSV)
    url = "https://www.matteoiacoviello.com/gpr_files/data_gpr_export.xls"
    show("Caldara/Iacoviello GPR direct (HEAD-ish)", fetch(url))

    # 5. NewsAPI.org — without key (will fail; document)
    url = "https://newsapi.org/v2/everything?q=iran%20ceasefire&pageSize=3"
    show("NewsAPI.org — no key (expected 401)", fetch(url))

    # 6. Wikidata SPARQL — example: recent diplomatic events
    sparql = """
    SELECT ?item ?itemLabel ?date WHERE {
      ?item wdt:P31/wdt:P279* wd:Q17554253 .  # ceasefire / armistice or subclass
      OPTIONAL { ?item wdt:P585 ?date . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
    } LIMIT 5
    """
    url = "https://query.wikidata.org/sparql?query=" + urllib.parse.quote(sparql) + "&format=json"
    show("Wikidata SPARQL — ceasefires", fetch(url, headers={"Accept": "application/sparql-results+json"}))

    # 7. ACLED — requires registration. Try without:
    url = "https://api.acleddata.com/acled/read?country=Iran&limit=2"
    show("ACLED — no creds (expected to require)", fetch(url))

    # 8. Mastodon — public timeline search via mastodon.social, no auth read
    q = urllib.parse.quote("Trump Putin")
    url = f"https://mastodon.social/api/v2/search?q={q}&type=statuses&limit=3"
    show("Mastodon — search (likely needs auth for v2 search)", fetch(url))

    # 9. Mastodon public timeline (no auth)
    url = "https://mastodon.social/api/v1/timelines/public?limit=2&local=false"
    show("Mastodon — public timeline (no auth)", fetch(url))

    # 10. Reddit JSON (no auth, ratelimited)
    url = "https://www.reddit.com/r/worldnews/search.json?q=iran+ceasefire&sort=new&limit=3"
    show("Reddit — worldnews search (no auth)", fetch(url))

    # 11. Hacker News Algolia (no auth)
    url = "https://hn.algolia.com/api/v1/search?query=Iran+ceasefire&tags=story"
    show("HN Algolia — Iran ceasefire", fetch(url))

    # 12. CommonCrawl News Index (CDX)
    url = "https://index.commoncrawl.org/CC-NEWS-2026-index?url=reuters.com/*&output=json&limit=2"
    show("CommonCrawl News CDX — reuters.com (likely 404 if index name wrong)", fetch(url))

    # 13. RSS — BBC World
    url = "https://feeds.bbci.co.uk/news/world/rss.xml"
    show("RSS — BBC World (raw XML)", fetch(url))

    # 14. RSS — Reuters World
    url = "https://www.reutersagency.com/feed/?best-topics=political-general&post_type=best"
    show("RSS — Reuters Agency political", fetch(url))

if __name__ == "__main__":
    main()

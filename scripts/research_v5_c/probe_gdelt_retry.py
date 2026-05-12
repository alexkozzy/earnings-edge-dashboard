#!/usr/bin/env python3
"""GDELT retry with proper 5s delay + Tavily/Exa quick auth checks (no key)."""
import json, time, urllib.parse, urllib.request, urllib.error

UA = "Mozilla/5.0 (research-v5-c1)"
TIMEOUT = 30

def fetch(url, headers=None, body=None):
    headers = headers or {}
    headers.setdefault("User-Agent", UA)
    req = urllib.request.Request(url, headers=headers, data=body)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = r.read()
            return {"ok": True, "status": r.status, "ms": int((time.time()-t0)*1000),
                    "body": data, "ctype": r.headers.get("Content-Type", "")}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "err": str(e), "body": e.read() if e.fp else b""}
    except Exception as e:
        return {"ok": False, "err": str(e)}

def show(label, res, n=600):
    print(f"\n=== {label} ===")
    if res.get("ok"):
        body = res["body"]
        try: txt = body.decode("utf-8", errors="replace")
        except: txt = repr(body[:200])
        print(f"  status={res['status']} ms={res['ms']} bytes={len(body)}")
        print(f"  EXCERPT: {txt[:n]}")
    else:
        print(f"  FAIL status={res.get('status')} err={res.get('err')}")
        if res.get("body"): print(f"  body[200]={res['body'][:200]!r}")

def main():
    # GDELT — wait 5s then issue carefully
    time.sleep(6)
    q = urllib.parse.quote('"Iran ceasefire"')
    url = f"https://api.gdeltproject.org/api/v2/doc/doc?query={q}&mode=ArtList&maxrecords=5&format=json&timespan=14days"
    show("GDELT Doc — 'Iran ceasefire' (14d)", fetch(url))

    time.sleep(6)
    q = urllib.parse.quote('"Trump" "Putin"')
    url = f"https://api.gdeltproject.org/api/v2/doc/doc?query={q}&mode=ArtList&maxrecords=5&format=json&timespan=7days"
    show("GDELT Doc — 'Trump Putin' (7d)", fetch(url))

    # GDELT volumetric timeline for theme — useful as a daily aggregate signal
    time.sleep(6)
    url = "https://api.gdeltproject.org/api/v2/doc/doc?query=" + urllib.parse.quote('Iran ceasefire') + "&mode=TimelineVol&format=json&timespan=14days"
    show("GDELT Doc — TimelineVol Iran ceasefire", fetch(url))

    # Tavily — public docs say API key required, but check error shape
    res = fetch("https://api.tavily.com/search",
                headers={"Content-Type": "application/json"},
                body=json.dumps({"query": "Iran ceasefire 2026"}).encode())
    show("Tavily search (no key)", res)

    # Exa — same
    res = fetch("https://api.exa.ai/search",
                headers={"Content-Type": "application/json"},
                body=json.dumps({"query": "Iran ceasefire 2026", "numResults": 3}).encode())
    show("Exa search (no key)", res)

    # GroundNews — undocumented public; show landing
    show("GroundNews search page", fetch("https://ground.news/search?q=iran+ceasefire"))

    # NYTimes RSS — free public
    show("NYT World RSS", fetch("https://rss.nytimes.com/services/xml/rss/nyt/World.xml"))

    # AP RSS
    show("AP World news RSS", fetch("https://rsshub.app/apnews/topics/apf-topnews"))

    # Wikipedia current events — free, machine-readable
    show("Wikipedia Current Events Portal (HTML)", fetch("https://en.wikipedia.org/wiki/Portal:Current_events"))

if __name__ == "__main__":
    main()

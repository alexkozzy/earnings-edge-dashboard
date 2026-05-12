#!/usr/bin/env python3
"""Probe data-api.polymarket.com /trades for query params and rate limits."""
import json, time, urllib.parse, urllib.request, urllib.error

UA = "Mozilla/5.0 (research-v5-c1)"
TIMEOUT = 20

def fetch(url, headers=None):
    headers = headers or {}
    headers.setdefault("User-Agent", UA)
    req = urllib.request.Request(url, headers=headers)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = r.read()
            return {"ok": True, "status": r.status, "ms": int((time.time()-t0)*1000),
                    "body": data, "ctype": r.headers.get("Content-Type", ""),
                    "headers": dict(r.headers)}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "err": str(e), "body": e.read() if e.fp else b""}
    except Exception as e:
        return {"ok": False, "err": str(e)}

def show(label, res, n=800):
    print(f"\n=== {label} ===")
    if res.get("ok"):
        body = res["body"]
        try: txt = body.decode("utf-8", errors="replace")
        except: txt = repr(body[:200])
        print(f"  OK status={res['status']} ms={res['ms']} bytes={len(body)}")
        # show rate-limit headers if any
        for h in ("X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset",
                  "RateLimit-Limit", "RateLimit-Remaining"):
            if h in res.get("headers", {}):
                print(f"  {h}: {res['headers'][h]}")
        print(f"  EXCERPT: {txt[:n]}")
    else:
        print(f"  FAIL status={res.get('status')} err={res.get('err')}")
        if res.get("body"): print(f"  body[300]={res['body'][:300]!r}")

def main():
    base = "https://data-api.polymarket.com"

    # Vary param names
    for url in [
        f"{base}/trades?limit=5",
        f"{base}/trades?limit=5&filterType=CASH&filterAmount=1000",
        f"{base}/trades?limit=5&takerOnly=true",
        f"{base}/trades?limit=5&minSize=100",  # guess
        f"{base}/trades?limit=5&market=0xe9588ac6d0f93c93ed289e560632357356ff61c6d62a59126acfd230c040cf99",  # condition_id from earlier
    ]:
        show(url, fetch(url))
        time.sleep(0.5)

    # Sort by timestamp / pagination?
    show("trades?limit=5&offset=10", fetch(f"{base}/trades?limit=5&offset=10"))
    show("trades?limit=200", fetch(f"{base}/trades?limit=200"))
    show("trades?limit=500", fetch(f"{base}/trades?limit=500"))
    show("trades?limit=1000", fetch(f"{base}/trades?limit=1000"))

    # Other endpoints?
    for ep in ["holders", "positions", "events", "rankings", "leaderboards", "user", "users"]:
        show(f"{ep} probe", fetch(f"{base}/{ep}?limit=2"))
        time.sleep(0.3)

    # Discover the openapi/docs
    for ep in ["openapi.json", "docs", "swagger.json", "/"]:
        show(f"meta {ep}", fetch(f"{base}/{ep}"))
        time.sleep(0.3)

if __name__ == "__main__":
    main()

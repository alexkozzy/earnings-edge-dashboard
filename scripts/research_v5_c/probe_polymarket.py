#!/usr/bin/env python3
"""
Agent C v5-c1 Part 2 — Polymarket activity-feed feasibility probes.
Tests gamma-api, CLOB, websocket, subgraph endpoints for trade-stream usability.
"""
import json, time, urllib.parse, urllib.request, urllib.error

UA = "Mozilla/5.0 (research-v5-c1)"
TIMEOUT = 20

def fetch(url, headers=None, body=None, method=None):
    headers = headers or {}
    headers.setdefault("User-Agent", UA)
    if body is not None and isinstance(body, (dict, list)):
        body = json.dumps(body).encode()
        headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, headers=headers, data=body, method=method)
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
        print(f"  OK status={res['status']} ms={res['ms']} bytes={len(body)}")
        print(f"  EXCERPT: {txt[:n]}")
    else:
        print(f"  FAIL status={res.get('status')} err={res.get('err')}")
        if res.get("body"): print(f"  body[300]={res['body'][:300]!r}")

def main():
    # 1. gamma-api markets list (known to work — used in v4)
    show("gamma-api markets (closed=false, limit=3, geopolitics tag)",
         fetch("https://gamma-api.polymarket.com/markets?closed=false&limit=3&order=volumeNum&ascending=false"))

    # 2. gamma-api: any trades/activity
    show("gamma-api /trades?", fetch("https://gamma-api.polymarket.com/trades?limit=3"))
    show("gamma-api /activity?", fetch("https://gamma-api.polymarket.com/activity?limit=3"))

    # 3. data-api (newer documented surface)
    show("data-api /trades?",
         fetch("https://data-api.polymarket.com/trades?limit=3"))
    show("data-api /activity?",
         fetch("https://data-api.polymarket.com/activity?limit=3"))

    # 4. CLOB API
    show("clob.polymarket.com / (root)", fetch("https://clob.polymarket.com/"))
    show("clob.polymarket.com /markets?limit=2", fetch("https://clob.polymarket.com/markets?limit=2"))
    show("clob.polymarket.com /trades (no auth)", fetch("https://clob.polymarket.com/trades?limit=3"))
    show("clob.polymarket.com /trade-history", fetch("https://clob.polymarket.com/trade-history?limit=3"))

    # 5. Try Polymarket subgraph (Goldsky)
    sg_query = {
        "query": "{ orderFilledEvents(first: 3, orderBy: timestamp, orderDirection: desc) { id timestamp maker taker makerAssetId takerAssetId makerAmountFilled takerAmountFilled } }"
    }
    show("Goldsky polymarket activity subgraph",
         fetch("https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.5/gn",
               body=sg_query))
    # Try alternative public Goldsky URL
    show("Goldsky polymarket positions subgraph",
         fetch("https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/positions-subgraph/0.0.7/gn",
               body={"query": "{ positions(first: 1) { id user } }"}))

    # 6. Try thegraph.com hosted subgraph
    show("thegraph.com polymarket-matic",
         fetch("https://api.thegraph.com/subgraphs/name/polymarket/matic-markets",
               body={"query": "{ _meta { block { number } } }"}))

if __name__ == "__main__":
    main()

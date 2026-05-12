#!/usr/bin/env python3
"""
Agent C v5-c1 Part 2 — Activity-feed PILOT.

Approach: instead of live-polling for 1 hour (would exceed time-box), pull
the last ~24h of trade history for the top 20 highest-volume currently-open
geopolitics markets via data-api.polymarket.com /trades?market=<cond>.

Then:
- Identify "large trades": notional = size * price > $1000.
- For each large trade, compute the next-1h price move on that same market.
- Aggregate: do large trades predict subsequent direction?

Geopolitics-tag inference: gamma-api markets returns events with category
attribute or tag list. Those Will-Oprah/LeBron/etc. markets are joke markets
(under "2028 Democratic nomination" event). For real geopolitics we filter
by tag slug "geopolitics" or category="Geopolitics" via the events endpoint.
"""
import json, time, urllib.parse, urllib.request, urllib.error
from collections import defaultdict

UA = "Mozilla/5.0 (research-v5-c1)"
TIMEOUT = 25

def fetch(url, headers=None):
    headers = headers or {}
    headers.setdefault("User-Agent", UA)
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"_err": f"HTTP {e.code}", "_body": e.read().decode("utf-8", errors="replace")[:200]}
    except Exception as e:
        return {"_err": str(e)}

def is_geopolitics(market):
    # gamma-api market objects have 'tags' (list of tag dicts), or 'events' parent has category
    tags = market.get("tags") or []
    if isinstance(tags, list):
        for t in tags:
            if isinstance(t, dict):
                slug = (t.get("slug") or "").lower()
                label = (t.get("label") or "").lower()
                if "geopolitic" in slug or "geopolitic" in label:
                    return True
                if slug in ("middle-east", "russia", "ukraine", "iran", "china", "war", "election-non-us"):
                    return True
            elif isinstance(t, str):
                if "geopolitic" in t.lower():
                    return True
    # Fallback: question text contains geopolitical keywords
    q = (market.get("question") or "").lower()
    geo_kw = ("iran", "ukraine", "russia", "putin", "china", "taiwan", "israel", "gaza",
              "hamas", "venezuela", "north korea", "houthi", "yemen", "syria", "ceasefire",
              "trump putin", "nato", "sanction", "missile", "nuclear", "kremlin", "tehran")
    if any(kw in q for kw in geo_kw):
        return True
    return False

def main():
    t_start = time.time()
    print(f"# pilot start {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")

    # 1. Find geopolitics markets — page through top by volume
    candidates = []
    for offset in range(0, 600, 100):
        url = f"https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=100&offset={offset}&order=volumeNum&ascending=false"
        ms = fetch(url)
        if isinstance(ms, dict) and ms.get("_err"):
            print(f"gamma fetch failed at offset {offset}: {ms}")
            break
        if not isinstance(ms, list) or not ms:
            break
        for m in ms:
            if is_geopolitics(m) and m.get("conditionId") and float(m.get("volumeNum", 0) or 0) > 0:
                candidates.append({
                    "cond": m["conditionId"],
                    "question": m.get("question", ""),
                    "vol": float(m.get("volumeNum", 0) or 0),
                    "endDate": m.get("endDate"),
                    "slug": m.get("slug", ""),
                })
        time.sleep(0.2)
    candidates.sort(key=lambda x: -x["vol"])
    top = candidates[:20]
    print(f"\nGeo-tagged candidates found: {len(candidates)}; top 20 used:")
    for i, c in enumerate(top):
        print(f"  [{i+1:2}] vol={c['vol']:>10.0f}  {c['question'][:80]}")

    if not top:
        print("ABORT: no geopolitics markets found")
        return

    # 2. For each, pull last ~48h of trades (limit=1000 + offset chunks)
    all_trades = {}  # cond -> list of trades
    cutoff = int(time.time()) - 48 * 3600
    for c in top:
        cond = c["cond"]
        trades = []
        for off in range(0, 4000, 1000):
            url = f"https://data-api.polymarket.com/trades?market={cond}&limit=1000&offset={off}"
            d = fetch(url)
            if isinstance(d, dict) and d.get("_err"):
                print(f"  trade fetch err for {cond[:10]}: {d}")
                break
            if not isinstance(d, list) or not d:
                break
            trades.extend(d)
            if min(t["timestamp"] for t in d) < cutoff or len(d) < 1000:
                break
            time.sleep(0.1)
        all_trades[cond] = trades
        print(f"  {cond[:10]}... fetched {len(trades)} trades for: {c['question'][:60]}")

    elapsed = int(time.time() - t_start)
    print(f"\nTrade fetch elapsed: {elapsed}s")

    # 3. For each market, sort trades by ts asc, identify large trades, compute fwd 1h price move
    # Price reference: use price at trade-time, then VWAP of trades in (t, t+3600] same outcome side.
    LARGE_NOTIONAL = 1000.0  # USDC
    FWD_WINDOW = 3600  # 1 hour
    results = []
    cond_to_q = {c["cond"]: c["question"] for c in top}
    for cond, trades in all_trades.items():
        if not trades: continue
        trades_sorted = sorted(trades, key=lambda t: t["timestamp"])
        # Filter to only 'BUY' side for clarity, and to a single outcome (outcomeIndex=0 = YES)
        # For directional inference, treat BUY of YES = bullish on YES, BUY of NO = bullish on NO.
        # Use: signed_dir = +1 if (side=BUY & outcomeIndex=0) or (side=SELL & outcomeIndex=1), else -1
        for i, t in enumerate(trades_sorted):
            notional = float(t["size"]) * float(t["price"])
            if notional < LARGE_NOTIONAL: continue
            outc = t.get("outcomeIndex", 0)
            side = t.get("side", "BUY")
            # bullish on YES if BUY YES or SELL NO; bearish on YES if SELL YES or BUY NO
            yes_dir = +1 if (side == "BUY" and outc == 0) or (side == "SELL" and outc == 1) else -1
            t_ts = t["timestamp"]
            # YES-equivalent price at trade time
            yes_px_now = float(t["price"]) if outc == 0 else 1 - float(t["price"])
            # Fwd window: trades in (t_ts, t_ts+FWD]
            fwd = [tr for tr in trades_sorted[i+1:] if tr["timestamp"] <= t_ts + FWD_WINDOW]
            if len(fwd) < 5: continue  # need enough trades to estimate fwd price
            yes_px_fwd_list = [float(tr["price"]) if tr.get("outcomeIndex",0)==0 else 1-float(tr["price"]) for tr in fwd]
            yes_px_end = sum(yes_px_fwd_list[-5:]) / min(5, len(yes_px_fwd_list))  # avg of last 5 in window
            move = yes_px_end - yes_px_now  # in YES probability terms
            signed_move = move * yes_dir  # positive = direction predicted
            results.append({
                "cond": cond, "ts": t_ts, "notional": notional, "yes_dir": yes_dir,
                "yes_px_now": yes_px_now, "yes_px_end_5": yes_px_end, "move": move,
                "signed_move": signed_move, "n_fwd_trades": len(fwd),
                "question": cond_to_q.get(cond, "")[:60],
            })

    # 4. Aggregate
    print(f"\nLarge trades (>${LARGE_NOTIONAL:.0f} notional) with usable fwd window: {len(results)}")
    if results:
        signed_moves = [r["signed_move"] for r in results]
        n_pos = sum(1 for v in signed_moves if v > 0)
        n_neg = sum(1 for v in signed_moves if v < 0)
        n_flat = len(signed_moves) - n_pos - n_neg
        mean_signed = sum(signed_moves) / len(signed_moves)
        # Bootstrap CI on mean
        import random
        random.seed(42)
        boots = []
        for _ in range(2000):
            sample = [random.choice(signed_moves) for _ in signed_moves]
            boots.append(sum(sample)/len(sample))
        boots.sort()
        ci_lo, ci_hi = boots[50], boots[1949]  # 95% CI (2.5% / 97.5%)

        print(f"  signed-move (in YES-prob terms): mean={mean_signed:+.4f}  95% CI=[{ci_lo:+.4f}, {ci_hi:+.4f}]")
        print(f"  hits (move in trade direction): {n_pos}/{len(results)} = {n_pos/len(results):.1%}")
        print(f"  misses: {n_neg}/{len(results)} = {n_neg/len(results):.1%}")
        print(f"  flat: {n_flat}")

        # Top 5 example large trades
        print(f"\nExample large trades and outcomes:")
        for r in sorted(results, key=lambda x: -x["notional"])[:5]:
            ts_str = time.strftime('%H:%M:%SZ', time.gmtime(r["ts"]))
            print(f"  ${r['notional']:>8.0f} dir={r['yes_dir']:+d} px {r['yes_px_now']:.3f}→{r['yes_px_end_5']:.3f} "
                  f"signed_move={r['signed_move']:+.3f} @ {ts_str} | {r['question']}")
    else:
        print("  (no large trades with usable fwd window — pilot inconclusive)")

    # 5. Save raw data
    out = {
        "generated_at": int(time.time()),
        "candidates_count": len(candidates),
        "top_markets": top,
        "n_trades_per_market": {c: len(t) for c, t in all_trades.items()},
        "large_trade_results": results,
    }
    out_path = "data/research/v5/cycle_1/activity_feed_pilot.json"
    import os
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(out, f, default=str)
    print(f"\nSaved raw to {out_path}")
    print(f"Total elapsed: {int(time.time()-t_start)}s")

if __name__ == "__main__":
    main()

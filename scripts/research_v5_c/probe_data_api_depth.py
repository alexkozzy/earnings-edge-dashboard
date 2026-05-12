#!/usr/bin/env python3
"""Test data-api historical depth and market-filtered behavior."""
import json, time, urllib.request, urllib.error

UA = "Mozilla/5.0 (research-v5-c1)"

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"err": str(e)}

now = int(time.time())
print(f"now={now}")

# 1. Latest 1000 trades — what is min/max ts?
data = fetch("https://data-api.polymarket.com/trades?limit=1000")
if isinstance(data, list):
    ts = [t["timestamp"] for t in data]
    print(f"limit=1000 latest: n={len(data)}, ts range = [{min(ts)}, {max(ts)}], span = {max(ts)-min(ts)}s")

# 2. Try offset to get older
data2 = fetch("https://data-api.polymarket.com/trades?limit=1000&offset=10000")
if isinstance(data2, list):
    ts = [t["timestamp"] for t in data2]
    print(f"offset=10000 latest: n={len(data2)}, ts range = [{min(ts)}, {max(ts)}], span = {max(ts)-min(ts)}s")
    print(f"  oldest: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(min(ts)))}")

# 3. Try offset deep
data3 = fetch("https://data-api.polymarket.com/trades?limit=1000&offset=100000")
if isinstance(data3, list):
    ts = [t["timestamp"] for t in data3]
    print(f"offset=100000: n={len(data3)}, ts range = [{min(ts)}, {max(ts)}], span = {max(ts)-min(ts)}s")
    print(f"  oldest: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(min(ts)))}")

# 4. Filter by market with offset for historical depth on a single market
# Find a high-volume geopolitics market first via gamma
markets = fetch("https://gamma-api.polymarket.com/markets?closed=false&limit=20&order=volumeNum&ascending=false&tag_id=2&related_tags=true")
if isinstance(markets, list):
    print("\nTop 5 currently active markets by volume:")
    for m in markets[:5]:
        print(f"  vol={m.get('volumeNum',0):.0f}  Q: {m.get('question','')[:80]}")
        print(f"    cond={m.get('conditionId','')}")

# 5. For one specific high-volume geo market, get trade history depth
# Use Bernie Sanders 2028 from earlier or strait-of-hormuz
cond = "0xffe381a80c1e36f9e0b03a542aa8fe56e74a67d2566a4e29396d4427aa4244c9"  # Strait of Hormuz
data4 = fetch(f"https://data-api.polymarket.com/trades?limit=1000&market={cond}")
if isinstance(data4, list):
    if data4:
        ts = [t["timestamp"] for t in data4]
        print(f"\nStrait-of-Hormuz trades: n={len(data4)}, range [{min(ts)}, {max(ts)}], span={(max(ts)-min(ts))/3600:.1f}h")
        print(f"  oldest: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(min(ts)))}")
        print(f"  newest: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(max(ts)))}")
    else:
        print("\nStrait-of-Hormuz trades: empty")

# 6. Same with offset
data5 = fetch(f"https://data-api.polymarket.com/trades?limit=1000&offset=1000&market={cond}")
if isinstance(data5, list) and data5:
    ts = [t["timestamp"] for t in data5]
    print(f"  with offset=1000: n={len(data5)}, oldest: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(min(ts)))}")

# 7. Rate limit test — 10 rapid requests
print("\nRate-limit test: 10 quick requests to /trades?limit=10")
for i in range(10):
    t0 = time.time()
    d = fetch("https://data-api.polymarket.com/trades?limit=10")
    ms = int((time.time()-t0)*1000)
    err = d.get("err") if isinstance(d, dict) else None
    n = len(d) if isinstance(d, list) else "ERR"
    print(f"  [{i}] ms={ms} n={n} err={err}")

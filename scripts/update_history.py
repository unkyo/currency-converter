import json
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "history-usd.json"

BASE = "USD"
CURRENCIES = ["USD", "EUR", "RUB", "KZT", "GEL", "GBP"]
API_URL = f"https://open.er-api.com/v6/latest/{BASE}"


def fetch_latest() -> dict:
    req = urllib.request.Request(
        API_URL,
        headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body)


def utc_date_from_unix(ts: int) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(ts))


def load_history() -> dict:
    if OUT.exists():
        return json.loads(OUT.read_text(encoding="utf-8"))
    return {"base": BASE, "currencies": CURRENCIES, "updatedAt": "", "points": []}


def save_history(data: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    latest = fetch_latest()
    if latest.get("result") != "success":
        raise SystemExit(f"API error: {latest.get('result')}")

    rates = latest.get("rates") or {}
    point_rates = {}
    for c in CURRENCIES:
        if c == BASE:
            point_rates[c] = 1
            continue
        v = rates.get(c)
        if not isinstance(v, (int, float)):
            raise SystemExit(f"Missing rate for {c}")
        point_rates[c] = float(v)

    ts = latest.get("time_last_update_unix")
    if not isinstance(ts, (int, float)):
        ts = int(time.time())
    ts = int(ts)
    date = utc_date_from_unix(ts)

    history = load_history()
    history["base"] = BASE
    history["currencies"] = CURRENCIES
    history["updatedAt"] = latest.get("time_last_update_utc") or time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(ts))

    points = history.get("points")
    if not isinstance(points, list):
        points = []

    # replace or append by date
    replaced = False
    for p in points:
        if isinstance(p, dict) and p.get("date") == date:
            p["rates"] = point_rates
            replaced = True
            break
    if not replaced:
        points.append({"date": date, "rates": point_rates})

    # keep last ~400 points
    points = [p for p in points if isinstance(p, dict) and isinstance(p.get("date"), str) and isinstance(p.get("rates"), dict)]
    points.sort(key=lambda p: p["date"])
    if len(points) > 400:
        points = points[-400:]

    history["points"] = points
    save_history(history)

    print(f"Updated {OUT} with {len(points)} points (last: {points[-1]['date']}).")


if __name__ == "__main__":
    main()


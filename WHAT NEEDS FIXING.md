WHAT NEEDS FIXING

Here’s my assessment of what you’ve got (docs + implied codebase behavior), with the biggest correctness issues called out.

What’s solid
	•	Clear mental model: the “Scan vs Polling” distinction is excellent and will prevent a ton of confusion when people see background traffic vs button-triggered traffic.
	•	Actionable knobs: the “where to change X” sections are genuinely useful—someone can land in the right file and make changes without spelunking.
	•	Operational realism: you’ve already internalized the free-tier constraint and built around it (queue / spacing), which is the right instinct.

Accuracy issues / contradictions to fix

1) Your “Dome API Parameters Guide” is now materially wrong

You say /polymarket/markets only supports limit and closed, and that category/tag filtering isn’t supported. The current official docs list multiple query parameters, including tags, status, min_volume, and pagination/time filters.  ￼

Specifically, docs show parameters like:
	•	market_slug[], event_slug[], condition_id[]
	•	tags[]
	•	status (open / closed)  ← this is effectively what your closed: false was trying to express
	•	min_volume
	•	limit (1–100), offset
	•	start_time, end_time  ￼

So: replace the “closed boolean” framing with status=open|closed, and update the “what’s missing” section—tag filtering is supported.  ￼

2) Backend rate limiting: your docs conflict with themselves

In one place you say:
	•	Backend improvements: “Request queue system (1 req/sec for Dome API)”
…and elsewhere:
	•	Backend config: “Rate Limiting: None implemented”

Pick one truth and make it consistent—right now a reader can’t tell whether the queue exists.

Also, Dome’s published tier limits show Free = 1 query/sec (and 10 per 10 seconds), which aligns with your 1.1s spacing approach.  ￼

3) Your scanner guidance should lean on server-side filters more

Since tags, status, and min_volume exist on /polymarket/markets, you can often avoid “fetch 100 then filter client-side.” That reduces payload size and makes scans faster while staying under Free-tier limits.  ￼

(You’re already using these filters in the SCANS_AND_INTERVALS description for /api/arbitrage/btc-check—your “Parameters Guide” just needs to catch up.)

4) Websocket notes: a little internally inconsistent

Your internal note says “WebSocket available for real-time order events (not price feeds).”
	•	The Polymarket websockets page does indeed describe real-time order data (subscription type orders).  ￼
	•	But the general Websockets intro claims streaming can cover “market prices, trades, orderbook changes, and more.”  ￼

So: your note might be correct for your current implementation/needs, but it should be phrased as:
	•	“Polymarket websocket (v1) is orders-focused” (per docs)  ￼
	•	“Dome websockets platform overall may support additional stream types” (per overview)  ￼

Documentation quality improvements (high leverage)
	•	De-duplicate: you pasted SCANS_AND_INTERVALS_GUIDE.md twice; keep one canonical copy and version it.
	•	Make the “source of truth” explicit: for anything API-related, link the exact doc page and note “verified against docs on Dec 25, 2025.”
	•	Add a “constraints” box at top: e.g., “Free tier: 1 QPS; UI displays N markets; polling interval X → expected latency Y.” (You already computed this once—great—just make it the first thing people see.)  ￼
	•	Call out scaling failure modes: “If you show 50 markets and poll each, you will exceed Free tier unless you cache/batch.”

Bottom line

Your scan/polling guide is strong and practical. The big fix is updating the Dome API Parameters Guide to match current reality (tags/status/min_volume/etc.), because right now it actively misleads readers into thinking server-side filtering isn’t possible.  ￼
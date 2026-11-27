// Public landing page for the Worker root, so the homepage URL shows what EdgeGlass is
// and a live read of the glance feed. Read-only: it only calls this Worker's GET routes.
export const LANDING_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EdgeGlass — glance-first trading HUD for Even Realities G2</title>
<style>
body{margin:0;background:#0b0d0b;color:#d8f5d0;font:16px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
main{max-width:760px;margin:0 auto;padding:40px 22px 70px}
h1{font-size:26px;margin:0 0 6px;color:#9dff8a}p{margin:0 0 14px}a{color:#9dff8a}
.hud{border:1px solid #2f5a2a;border-radius:12px;padding:18px 20px;margin:22px 0;background:#0f160e;white-space:pre-wrap;min-height:120px}
.muted{color:#7fa679}table{border-collapse:collapse;width:100%;margin:8px 0 18px}td{padding:6px 4px;border-bottom:1px solid #1d2e1b;vertical-align:top}
select{background:#0f160e;color:#d8f5d0;border:1px solid #2f5a2a;border-radius:6px;padding:4px 8px;font:inherit}
</style></head><body><main>
<h1>EdgeGlass</h1>
<p>A glance-first trading-session HUD for <b>Even Realities G2</b> glasses: Polymarket BTC/ETH 5m and 15m Up/Down markets plus Hyperliquid mids, with Telegram for pairing and alerts. Paper only, read-only feeds. Not financial advice.</p>
<p class="muted">This page is the public API Worker the glasses app talks to. Below is the live glance card it serves right now.</p>
<label>Market <select id="m"><option>btc-15m</option><option>btc-5m</option><option>eth-15m</option><option>eth-5m</option></select></label>
<div class="hud" id="hud">loading…</div>
<table>
<tr><td><a href="/health">/health</a></td><td>service status</td></tr>
<tr><td><a href="/glance?market=btc-15m">/glance?market=btc-15m</a></td><td>glance card data (UP mid, HL mid, 1-min moves, edge heuristic)</td></tr>
<tr><td><a href="/markets">/markets</a></td><td>all four markets ranked by what moved</td></tr>
<tr><td>POST /intent</td><td>voice/text rule grammar → paper Confirm card</td></tr>
</table>
<p>Run the app: <code>npm install &amp;&amp; npm run pack</code>, then load <code>dist-pkg/edgeglass-0.2.0.ehpk</code> on G2 or open it in the official Even Hub simulator. Source and setup: <a href="https://github.com/yayguru/edgeglass">github.com/yayguru/edgeglass</a> (MIT).</p>
</main>
<script>
const hud=document.getElementById('hud'),sel=document.getElementById('m');
async function load(){try{const r=await fetch('/glance?market='+sel.value);const j=await r.json();hud.textContent=JSON.stringify(j,null,2)}catch(e){hud.textContent='feed unavailable: '+e}}
sel.onchange=load;load();setInterval(load,15000);
</script></body></html>`

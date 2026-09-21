const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { query } = require('./db');
const store = require('./store');
const { getDrawId, getPhase } = require('./draw');
const { mountMiniApp } = require('./miniapp');

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-secret'] || req.query.admin_secret;
  if (token !== config.adminSecret) {
    return res.status(401).json({ error: 'unauthorized. Provide ?admin_secret= or X-Admin-Secret header' });
  }
  next();
}

function dashboardHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>NairaGiveBot Admin</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:20px auto;padding:0 16px}input,select,button{padding:8px;margin:4px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;font-size:13px}.card{border:1px solid #ddd;border-radius:8px;padding:12px;margin:12px 0}</style>
</head><body>
<h1>NairaGiveBot Admin</h1>
<div class="card"><b>Auth:</b> append <code>?admin_secret=YOUR_SECRET</code> to API calls. Set ADMIN_SECRET env.</div>
<div class="card"><h3>Current hourly draw</h3><div id="cur">loading...</div>
<button onclick="triggerDraw()">Trigger draw now (for current hour)</button></div>
<div class="card"><h3>Create custom giveaway</h3>
<p>Examples: 100 naira every 5 min for 3 hours • 100,000 x2 winners on 5/10/2026 6pm • 400 naira every 1 min for 10 min x2 winners</p>
Name <input id="g_name" value="Evening Splash"/><br/>
Category <select id="g_cat"><option>cash</option><option>airtime</option><option>data</option><option>gadgets</option><option>food</option><option>others</option></select><br/>
Amount <input id="g_amt" type="number" value="100"/><br/>
Winners per draw <input id="g_win" type="number" value="1"/><br/>
Interval minutes (leave empty for one-off) <input id="g_int" type="number" placeholder="5"/><br/>
Starts at <input id="g_start" type="datetime-local"/><br/>
Ends at <input id="g_end" type="datetime-local"/><br/>
One-off scheduled at <input id="g_sched" type="datetime-local" value="2026-10-05T18:00"/><br/>
Sponsor name <input id="g_sp" value="NairaGiveBot"/><br/>
Rules (shown to users) <input id="g_rules" size="60" placeholder="Free entry · max 10 tickets · ..."/><br/>
<button onclick="createGiveaway()">Create</button><div id="g_out"></div></div>
<div class="card"><h3>Giveaways</h3><div id="list">loading...</div></div>
<div class="card"><h3>Withdrawals (min ₦100 — pay from your bank app, then mark Paid)</h3><div id="wd">loading...</div></div>
<div class="card"><h3>Recent draws</h3><div id="draws">loading...</div></div>
<script>
const S = new URLSearchParams(location.search).get('admin_secret')||'';
function h(u,m,b){return fetch(u+(u.includes('?')?'&':'?')+'admin_secret='+encodeURIComponent(S),{method:m||'GET',headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(r=>r.json())}
function load(){h('/api/draws/current').then(d=>{document.getElementById('cur').innerHTML='<pre>'+JSON.stringify(d,null,2)+'</pre>'});h('/api/giveaways').then(d=>{document.getElementById('list').innerHTML='<pre>'+JSON.stringify(d,null,2)+'</pre>'});h('/api/draws/recent?limit=10').then(d=>{document.getElementById('draws').innerHTML='<pre>'+JSON.stringify(d,null,2)+'</pre>'});loadWd()}
function createGiveaway(){const b={name:val('g_name'),category:val('g_cat'),amount:+val('g_amt'),winners_per_draw:+val('g_win'),interval_minutes:val('g_int')?+val('g_int'):null,starts_at:val('g_start')?new Date(val('g_start')).toISOString():null,ends_at:val('g_end')?new Date(val('g_end')).toISOString():null,scheduled_at:val('g_sched')?new Date(val('g_sched')).toISOString():null,sponsor_name:val('g_sp'),rules:val('g_rules')||null};h('/api/giveaways','POST',b).then(d=>{document.getElementById('g_out').innerHTML='<pre>'+JSON.stringify(d,null,2)+'</pre>';load()})}
function triggerDraw(){h('/api/draws/current/trigger','POST',{}).then(d=>alert(JSON.stringify(d)))}
function loadWd(){h('/api/withdrawals?status=pending').then(d=>{document.getElementById('wd').innerHTML=d.length?d.map(w=>'<div>#' + w.id + ' @' + (w.username||w.telegram_id) + ' <b>₦' + w.amount + '</b><br>' + esc(w.full_name) + ' · ' + esc(w.account_number) + ' · ' + esc(w.bank_name) + ' <button onclick="wdAct(' + w.id + ',\\'paid\\')">Paid</button> <button onclick="wdAct(' + w.id + ',\\'rejected\\')">Reject</button></div>').join(''):'no pending withdrawals'})}
function wdAct(id,act){h('/api/withdrawals/'+id+'/'+act,'POST',{}).then(()=>{loadWd()})}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function val(id){return document.getElementById(id).value}
load();
</script></body></html>`;
}

function createAdminApp() {
  const app = express();
  app.use(express.json());

  const indexFile = path.join(__dirname, '..', 'index.html');
  app.get('/', (_req, res) => {
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
    res.send('NairaGiveBot is running. Admin at /admin');
  });
  app.get('/admin', (_req, res) => res.send(dashboardHtml()));
  app.get('/health', (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));

  mountMiniApp(app);

  app.get('/api/draws/current', async (_req, res) => {
    try {
      const now = new Date();
      const drawId = getDrawId(now);
      const draw = (await store.ensureDraw({ drawId }).catch(() => null)) || (await store.getDraw(drawId));
      const tickets = await store.getTicketsForDraw(drawId).catch(() => []);
      const winners = await store.getWinners(drawId).catch(() => []);
      res.json({ drawId, phase: getPhase(now), draw, ticketCount: tickets.length, winners });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/draws/recent', async (req, res) => {
    try {
      const rows = await store.getRecentResults(parseInt(req.query.limit || '10', 10));
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/draws/current/trigger', requireAdmin, async (_req, res) => {
    try {
      const drawId = getDrawId(new Date());
      await store.ensureDraw({ drawId });
      const winners = await store.runSeededDraw(drawId);
      res.json({ drawId, winners });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Manual trigger for any draw id (admin)
  app.post('/api/draws/:id/trigger', requireAdmin, async (req, res) => {
    try {
      await store.ensureDraw({ drawId: req.params.id });
      const winners = await store.runSeededDraw(req.params.id);
      res.json({ drawId: req.params.id, winners });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---- Giveaways CRUD (admin creates custom giveaways) ----
  app.get('/api/giveaways', async (_req, res) => {
    try {
      const r = await query('SELECT * FROM giveaways ORDER BY id DESC LIMIT 100');
      res.json(r.rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/giveaways', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.name || !b.amount) return res.status(400).json({ error: 'name and amount required' });
      const r = await query(
        `INSERT INTO giveaways (name, category, amount, winners_per_draw, interval_minutes, starts_at, ends_at, scheduled_at, sponsor_name, sponsor_link, sponsor_bio, rules, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active') RETURNING *`,
        [
          b.name,
          b.category || 'cash',
          b.amount,
          b.winners_per_draw || 1,
          b.interval_minutes || null,
          b.starts_at || null,
          b.ends_at || null,
          b.scheduled_at || null,
          b.sponsor_name || config.sponsor.name,
          b.sponsor_link || config.sponsor.link,
          b.sponsor_bio || config.sponsor.bio,
          b.rules || null,
        ]
      );
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/giveaways/:id', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const r = await query(`UPDATE giveaways SET status=COALESCE($2,status) WHERE id=$1 RETURNING *`, [
        req.params.id,
        b.status,
      ]);
      if (!r.rows.length) return res.status(404).json({ error: 'not found' });
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---- Withdrawals queue (admin pays manually, or rejects = refund) ----
  app.get('/api/withdrawals', requireAdmin, async (req, res) => {
    try {
      res.json(await store.getWithdrawals(req.query.status || 'pending'));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/withdrawals/:id/:action', requireAdmin, async (req, res) => {
    try {
      const action = req.params.action;
      if (action !== 'paid' && action !== 'rejected') {
        return res.status(400).json({ error: 'action must be paid or rejected' });
      }
      res.json(await store.resolveWithdrawal(req.params.id, action));
    } catch (e) {
      if (e.code === 'NOT_FOUND') return res.status(404).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  return app;
}

module.exports = { createAdminApp };

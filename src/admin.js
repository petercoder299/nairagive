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
<title>NairaGiveBot — Admin</title>
<style>
:root{--bg:#0e0e0f;--surface:#161618;--surface2:#1c1c1f;--ink:#f4f3ef;--ink2:#b3b1ab;--ink3:#7e7d78;--line:#262629;--gold:#d3b168;--green:#7bc98f;--red:#e08a8a}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:Inter,-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:14px;line-height:1.5;min-height:100vh;padding-bottom:60px}
.wrap{max-width:1080px;margin:0 auto;padding:24px 20px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
.brand{display:flex;align-items:center;gap:10px}
.mark{width:34px;height:34px;border-radius:50%;background:var(--ink);color:#0b0b0c;font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center}
.brand b{letter-spacing:4px;font-size:16px;font-weight:600}
.toolbar{display:flex;gap:10px}
.toolbar button{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:8px 16px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.toolbar button:hover{border-color:var(--gold)}
.gate{max-width:420px;margin:8vh auto 0;background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:32px 28px}
.gate h1{font-size:26px;margin-bottom:6px;text-align:center}
.gate p{color:var(--ink2);font-size:13px;margin-bottom:14px;text-align:center}
.gate input{width:100%;background:var(--surface2);border:1px solid var(--line);color:var(--ink);border-radius:12px;padding:13px 15px;font:inherit;outline:none;margin-bottom:10px}
.gate input:focus{border-color:var(--gold)}
.gate button{width:100%;background:var(--ink);color:#0b0b0c;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-size:13px;border:none;border-radius:12px;padding:14px;cursor:pointer}
#log{margin-top:14px;background:#0b0b0c;border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-family:monospace;font-size:12px;max-height:220px;overflow-y:auto;white-space:pre-wrap;word-break:break-all}
#log .ok{color:var(--green)}#log .bad{color:var(--red)}#log .dim{color:var(--ink3)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0 4px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px}
.stat .k{font-size:10.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--ink3)}
.stat .v{font-size:27px;margin-top:5px;font-variant-numeric:tabular-nums}
.stat .v.gold{color:var(--gold)}.stat .v.green{color:var(--green)}
h2{font-size:20px;margin:26px 0 4px;font-weight:600}
p.sub{color:var(--ink3);font-size:12.5px;margin-bottom:10px}
.box{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;display:flex;gap:10px;flex-wrap:wrap}
.box input,.box select{flex:1;min-width:130px;background:var(--surface2);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:12px 14px;font:inherit;font-size:13px;outline:none}
.box input:focus,.box select:focus{border-color:var(--gold)}
.box button{background:var(--ink);color:#0b0b0c;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-size:12.5px;border:none;border-radius:10px;padding:13px 22px;cursor:pointer}
table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;font-size:13px}
th,td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top;word-break:break-all}
tr:last-child td{border-bottom:none}
th{font-size:10.5px;letter-spacing:1.8px;text-transform:uppercase;color:var(--ink3);background:var(--surface2)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.pill{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;padding:3px 10px;border:1px solid var(--line);color:var(--ink2)}
.pill.paid{color:var(--green);border-color:#2c4a35}
.pill.pending{color:var(--gold);border-color:#4a4023}
.pill.rejected{color:var(--red);border-color:#4a2c2c}
.pill.done{color:var(--ink3)}
button.mini-ok{background:transparent;color:var(--green);border:1px solid #2c4a35;border-radius:999px;padding:7px 14px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;margin-right:6px}
button.mini-no{background:transparent;color:var(--red);border:1px solid #4a2c2c;border-radius:999px;padding:7px 14px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.tabs{display:flex;gap:10px;margin:10px 0}
.tabs button{flex:1;padding:10px;font-weight:600;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;border-radius:10px;border:1px solid var(--line);background:var(--surface);cursor:pointer;color:var(--ink2);font-family:inherit}
.tabs button.on{border-color:var(--gold);color:var(--gold)}
.pager{display:flex;align-items:center;gap:12px;margin-top:14px}
.pager button{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:9px 18px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.pager button:disabled{opacity:.35}
.pager .pg-info{font-size:12.5px;color:var(--ink2);font-variant-numeric:tabular-nums}
#toast{font-size:13px;margin:12px 0;min-height:20px;color:var(--red)}
#toast.good{color:var(--green)}
.muted{color:var(--ink3);font-size:12px}
@media(max-width:760px){.stats{grid-template-columns:repeat(2,1fr)}table{font-size:12px}th,td{padding:9px 10px}}
</style>
</head><body><div class="wrap">
<header><div class="brand"><span class="mark">₦</span><b>NAIRAGIVE · ADMIN</b></div>
<div class="toolbar"><button id="refreshBtn" style="display:none">Refresh</button><button id="logoutBtn" style="display:none">Logout</button></div></header>
<div class="gate" id="gate"><h1>Restricted</h1><p>Enter your admin secret. It stays in this browser tab only.</p>
<input id="key" type="password" placeholder="Admin secret" autocomplete="off"/><button id="loginBtn">Login</button><div id="log"></div></div>
<div id="dash" style="display:none"><div id="toast"></div><div class="stats" id="stats"></div>
<h2>Withdrawals</h2><p class="sub">Paid = you sent the money from your bank app. Reject = refunded to balance.</p>
<div class="tabs"><button id="tabP" class="on">Pending</button><button id="tabH">Paid / Rejected</button></div>
<div style="overflow-x:auto"><table><thead><tr><th>ID</th><th>User</th><th class="num">Amount</th><th>Bank details</th><th>Status</th><th>When</th><th></th></tr></thead><tbody id="wdRows"></tbody></table></div><div id="pgWd"></div>
<h2>Giveaways</h2><p class="sub">Create interval or one-off draws. Prefix OG + 9-digit tickets for Others.</p>
<div class="box">
<input id="g_name" placeholder="Name — e.g. Evening Splash"/>
<select id="g_cat"><option>cash</option><option>airtime</option><option>data</option><option>gadgets</option><option>food</option><option>others</option></select>
<input id="g_amt" type="number" placeholder="Amount ₦"/>
<input id="g_win" type="number" placeholder="Winners per draw" value="1"/>
<input id="g_int" type="number" placeholder="Interval min (blank = one-off)"/>
<input id="g_start" type="datetime-local"/><input id="g_end" type="datetime-local"/>
<input id="g_sched" type="datetime-local" value="2026-10-05T18:00"/>
<input id="g_sp" placeholder="Sponsor name" value="NairaGiveBot"/>
<input id="g_rules" placeholder="Rules (shown to users)"/>
<input id="g_prefix" placeholder="Draw prefix (e.g. OG)" size="8"/>
<input id="g_digits" type="number" placeholder="Ticket digits" value="10"/>
<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input id="g_sponsored" type="checkbox" checked style="flex:none;min-width:0;width:auto"/> Sponsored (show sponsor)</label>
<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input id="g_spot" type="checkbox" style="flex:none;min-width:0;width:auto"/> Spotlight on Cash page</label>
<button id="createBtn">Create</button></div><div id="g_out" style="margin-top:10px"></div>
<div style="overflow-x:auto;margin-top:10px"><table><thead><tr><th>ID</th><th>Name</th><th>Cat</th><th class="num">Amount</th><th class="num">Winners</th><th>Schedule</th><th>Status</th><th></th></tr></thead><tbody id="gRows"></tbody></table></div><div id="pgG"></div>
<h2>Draws</h2><p class="sub">Live draw, manual trigger and recent results.</p>
<div class="box"><input id="curInfo" readonly onclick="this.select()"/><button id="triggerBtn">Trigger current draw</button></div>
<div style="overflow-x:auto;margin-top:10px"><table><thead><tr><th>Draw</th><th class="num">Amount</th><th>Winning ticket</th><th>Winner</th></tr></thead><tbody id="drawRows"></tbody></table></div><div id="pgD"></div>
<p class="muted" style="margin-top:16px" id="updated"></p></div></div>
<script>
(function(){
"use strict";
var keyEl=document.getElementById("key"),logEl=document.getElementById("log");
var KEY="";var DATA=null;var wdTab="pending";var PER=10;var PG={wd:1,g:1,d:1};
try{var q=new URLSearchParams(location.search).get("admin_secret");if(q){keyEl.value=q;}}catch(e){}
function log(m,c){var l=document.createElement("div");if(c)l.className=c;l.textContent=new Date().toLocaleTimeString()+"  "+m;logEl.appendChild(l);logEl.scrollTop=logEl.scrollHeight}
function toast(m,g){var t=document.getElementById("toast");t.textContent=m;t.className=g?"good":""}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function fmt(n){return "₦"+Number(n||0).toLocaleString("en-NG")}
function dt(s){try{return s?new Date(s).toLocaleString():"—"}catch(e){return "—"}}
function val(id){return document.getElementById(id).value}
function call(m,path,body){var url=path+(path.indexOf("?")===-1?"?":"&")+"admin_secret="+encodeURIComponent(KEY);var o={method:m,headers:{"Content-Type":"application/json"},cache:"no-store"};if(body)o.body=JSON.stringify(body);return fetch(url,o).then(function(r){return r.text().then(function(t){var j=null;try{j=JSON.parse(t)}catch(e){throw new Error("HTTP "+r.status+" non-JSON")}if(!r.ok)throw new Error("HTTP "+r.status+": "+((j&&j.error)||"failed"));return j})})}
function login(){KEY=keyEl.value.trim();logEl.innerHTML="";if(!KEY){log("Enter the admin secret.","bad");return}log("Checking secret…","dim");call("GET","/api/admin/overview").then(function(j){if(!j.ok)throw new Error("login failed");try{sessionStorage.setItem("ng_admin",KEY)}catch(e){}DATA=j;document.getElementById("gate").style.display="none";document.getElementById("dash").style.display="block";document.getElementById("refreshBtn").style.display="block";document.getElementById("logoutBtn").style.display="block";render();log("Logged in.","ok")}).catch(function(e){log("Login failed: "+e.message,"bad")})}
try{var s=sessionStorage.getItem("ng_admin");if(s){keyEl.value=s;login()}}catch(e){}
function pagerHTML(p,total,sec){if(total<=1)return "";return "<div class='pager'><button data-pgsec='"+sec+"' data-pgd='-1'"+(p<=1?" disabled":"")+">← Previous</button><span class='pg-info'>Page "+p+" of "+total+"</span><button data-pgsec='"+sec+"' data-pgd='1'"+(p>=total?" disabled":"")+">Next →</button></div>"}
function slice(list,sec){var total=Math.max(1,Math.ceil(list.length/PER));if(PG[sec]>total)PG[sec]=total;if(PG[sec]<1)PG[sec]=1;return{items:list.slice((PG[sec]-1)*PER,PG[sec]*PER),page:PG[sec],total:total}}
function stat(k,v,cls){return "<div class='stat'><div class='k'>"+k+"</div><div class='v"+(cls?" "+cls:"")+"'>"+v+"</div></div>"}
function render(){var t=DATA.totals||{};document.getElementById("stats").innerHTML=stat("Users",t.users)+stat("Draws",t.draws)+stat("Tickets",t.tickets)+stat("Winners",t.winners)+stat("Paid out",fmt(t.paidOut),"green")+stat("Pending",t.pendingCount+" · "+fmt(t.pendingSum),"gold");renderWd();renderG();renderD();document.getElementById("updated").textContent="Updated "+new Date().toLocaleTimeString()}
function renderWd(){var list=(DATA.withdrawals||[]).filter(function(w){return wdTab==="pending"?w.status==="pending":w.status!=="pending"});var p=slice(list,"wd");document.getElementById("wdRows").innerHTML=p.items.map(function(w){var bank=[w.full_name,w.account_number,w.bank_name].filter(Boolean).join(" · ");var act=w.status==="pending"?"<button class='mini-ok' data-act='paid' data-id='"+w.id+"'>Paid</button><button class='mini-no' data-act='rejected' data-id='"+w.id+"'>Reject</button>":"";return "<tr><td>"+w.id+"</td><td>"+esc(w.username||w.telegram_id)+"</td><td class='num'>"+fmt(w.amount)+"</td><td>"+esc(bank)+"</td><td><span class='pill "+w.status+"'>"+w.status+"</span></td><td>"+dt(w.created_at)+"</td><td>"+act+"</td></tr>"}).join("")||"<tr><td colspan='7' class='muted'>Nothing here.</td></tr>";document.getElementById("pgWd").innerHTML=pagerHTML(p.page,p.total,"wd")}
function schedOf(g){if(g.interval_minutes)return "every "+g.interval_minutes+"m";if(g.scheduled_at)return dt(g.scheduled_at);return "—"}
function renderG(){var p=slice(DATA.giveaways||[],"g");document.getElementById("gRows").innerHTML=p.items.map(function(g){var done=g.status!=="active";return "<tr><td>"+g.id+"</td><td><b>"+esc(g.name)+"</b></td><td>"+esc(g.category)+"</td><td class='num'>"+fmt(g.amount)+"</td><td class='num'>"+g.winners_per_draw+"</td><td>"+schedOf(g)+"</td><td><span class='pill "+(done?"done":"pending")+"'>"+g.status+"</span></td><td><button class='mini-ok' data-edit='"+g.id+"'>Sponsor</button><button class='mini-ok' data-spot='"+g.id+"' title='Toggle Cash spotlight'>"+(g.spotlight?"★":"☆")+"</button>"+(done?"":"<button class='mini-no' data-stop='"+g.id+"'>Stop</button>")+"</td></tr>"}).join("")||"<tr><td colspan='8' class='muted'>No giveaways yet.</td></tr>";document.getElementById("pgG").innerHTML=pagerHTML(p.page,p.total,"g")}
function renderD(){call("GET","/api/draws/current").then(function(d){document.getElementById("curInfo").value=d.drawId+" · "+d.phase+" · "+d.ticketCount+" entries"}).catch(function(){});
var p=slice(DATA.recent||[],"d");document.getElementById("drawRows").innerHTML=p.items.map(function(r){return "<tr><td><b>"+esc(r.id)+"</b></td><td class='num'>"+fmt(r.amount)+"</td><td class='mono'>"+esc(r.ticket_code||"—")+"</td><td>"+esc(r.username?"@"+r.username:"—")+"</td></tr>"}).join("")||"<tr><td colspan='4' class='muted'>No draws yet.</td></tr>";document.getElementById("pgD").innerHTML=pagerHTML(p.page,p.total,"d")}
document.getElementById("loginBtn").addEventListener("click",login);
keyEl.addEventListener("keydown",function(e){if(e.key==="Enter")login()});
document.getElementById("logoutBtn").addEventListener("click",function(){KEY="";DATA=null;try{sessionStorage.removeItem("ng_admin")}catch(e){}keyEl.value="";document.getElementById("dash").style.display="none";document.getElementById("gate").style.display="block";document.getElementById("refreshBtn").style.display="none";document.getElementById("logoutBtn").style.display="none"});
document.getElementById("refreshBtn").addEventListener("click",function(){if(!DATA)return;call("GET","/api/admin/overview").then(function(j){DATA=j;render();toast("Refreshed.",true)}).catch(function(e){toast("Refresh failed: "+e.message)})});
document.getElementById("tabP").addEventListener("click",function(){wdTab="pending";PG.wd=1;document.getElementById("tabP").classList.add("on");document.getElementById("tabH").classList.remove("on");renderWd()});
document.getElementById("tabH").addEventListener("click",function(){wdTab="history";PG.wd=1;document.getElementById("tabH").classList.add("on");document.getElementById("tabP").classList.remove("on");renderWd()});
document.getElementById("createBtn").addEventListener("click",function(){var b={name:val("g_name"),category:val("g_cat"),amount:+val("g_amt"),winners_per_draw:+val("g_win")||1,interval_minutes:val("g_int")?+val("g_int"):null,starts_at:val("g_start")?new Date(val("g_start")).toISOString():null,ends_at:val("g_end")?new Date(val("g_end")).toISOString():null,scheduled_at:val("g_sched")?new Date(val("g_sched")).toISOString():null,sponsor_name:val("g_sp")||undefined,rules:val("g_rules")||null,draw_prefix:val("g_prefix")||null,ticket_digits:val("g_digits")?+val("g_digits"):10,sponsored:document.getElementById("g_sponsored").checked,spotlight:document.getElementById("g_spot").checked};if(!b.name||!b.amount){toast("Name and amount are required.");return}call("POST","/api/giveaways",b).then(function(d){document.getElementById("g_out").innerHTML="<span class='pill pending'>created #"+d.id+"</span>";PG.g=1;return call("GET","/api/admin/overview")}).then(function(j){DATA=j;render();toast("Giveaway created.",true)}).catch(function(e){toast("Create failed: "+e.message)})});
document.getElementById("triggerBtn").addEventListener("click",function(){call("POST","/api/draws/current/trigger",{}).then(function(d){toast("Draw triggered: "+(d.winners||[]).length+" winner(s).",true)}).catch(function(e){toast("Trigger failed: "+e.message)})});
document.getElementById("gRows").addEventListener("click",function(e){var s=e.target.closest?e.target.closest("[data-spot]"):null;if(s){var gid=s.getAttribute("data-spot");var cur=null;for(var i=0;i<DATA.giveaways.length;i++){if(String(DATA.giveaways[i].id)===gid)cur=DATA.giveaways[i]}call("PATCH","/api/giveaways/"+gid,{spotlight:!(cur&&cur.spotlight)}).then(function(){return call("GET","/api/admin/overview")}).then(function(j){DATA=j;render();toast("Spotlight updated.",true)}).catch(function(err){toast("Failed: "+err.message)});return}});
document.getElementById("gRows").addEventListener("click",function(e){var b=e.target.closest?e.target.closest("[data-edit]"):null;if(b){var g=null;for(var i=0;i<DATA.giveaways.length;i++){if(String(DATA.giveaways[i].id)===b.getAttribute("data-edit"))g=DATA.giveaways[i]}if(!g)return;var nm=prompt("Sponsor name",g.sponsor_name||"");if(nm===null)return;var ln=prompt("Sponsor link",g.sponsor_link||"");if(ln===null)return;var bi=prompt("Sponsor bio",g.sponsor_bio||"");if(bi===null)return;call("PATCH","/api/giveaways/"+g.id,{sponsor_name:nm,sponsor_link:ln,sponsor_bio:bi}).then(function(){return call("GET","/api/admin/overview")}).then(function(j){DATA=j;render();toast("Sponsor updated — live immediately.",true)}).catch(function(err){toast("Failed: "+err.message)});return}});
document.getElementById("gRows").addEventListener("click",function(e){var b=e.target.closest?e.target.closest("[data-stop]"):null;if(!b)return;var id=b.getAttribute("data-stop");if(!confirm("Stop giveaway #"+id+"? Open draws already created keep running."))return;call("PATCH","/api/giveaways/"+id,{status:"done"}).then(function(){return call("GET","/api/admin/overview")}).then(function(j){DATA=j;render();toast("Giveaway stopped.",true)}).catch(function(err){toast("Failed: "+err.message)})});
document.getElementById("wdRows").addEventListener("click",function(e){var b=e.target.closest?e.target.closest("[data-act]"):null;if(!b)return;var id=b.getAttribute("data-id");var act=b.getAttribute("data-act");if(!confirm(act==="paid"?"Confirm withdrawal #"+id+" as PAID?":"Reject withdrawal #"+id+"? The amount will be refunded."))return;call("POST","/api/withdrawals/"+id+"/"+act,{}).then(function(){return call("GET","/api/admin/overview")}).then(function(j){DATA=j;render();toast(act==="paid"?"Marked paid.":"Rejected and refunded.",true)}).catch(function(err){toast("Failed: "+err.message)})});
document.addEventListener("click",function(e){var b=e.target.closest?e.target.closest("[data-pgsec]"):null;if(!b||b.disabled)return;var sec=b.getAttribute("data-pgsec");if(!PG.hasOwnProperty(sec))return;PG[sec]+=parseInt(b.getAttribute("data-pgd"),10)||0;if(sec==="wd")renderWd();else if(sec==="g")renderG();else if(sec==="d")renderD()});
})();
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
      const prefix = (b.draw_prefix || '').trim().toUpperCase() || null;
      const sponsored = b.sponsored === undefined ? true : !!b.sponsored;
      const spotlight = !!b.spotlight;
      let seq = null;
      if (prefix) {
        const s = await query(`SELECT COALESCE(MAX(draw_seq),0)::int + 1 AS n FROM giveaways WHERE draw_prefix = $1`, [prefix]).catch(() => ({ rows: [{ n: 1 }] }));
        seq = s.rows[0].n;
      }
      const r = await query(
        `INSERT INTO giveaways (name, category, amount, winners_per_draw, interval_minutes, starts_at, ends_at, scheduled_at, sponsor_name, sponsor_link, sponsor_bio, rules, draw_prefix, ticket_digits, sponsored, draw_seq, spotlight, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'active') RETURNING *`,
        [
          b.name,
          b.category || 'cash',
          b.amount,
          b.winners_per_draw || 1,
          b.interval_minutes || null,
          b.starts_at || null,
          b.ends_at || null,
          b.scheduled_at || null,
          sponsored ? b.sponsor_name || config.sponsor.name : b.sponsor_name || null,
          sponsored ? b.sponsor_link || config.sponsor.link : b.sponsor_link || null,
          sponsored ? b.sponsor_bio || config.sponsor.bio : b.sponsor_bio || null,
          b.rules || null,
          prefix,
          b.ticket_digits || 10,
          sponsored,
          seq,
          spotlight,
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
      const sets = [];
      const vals = [req.params.id];
      if (b.status !== undefined) {
        vals.push(b.status);
        sets.push(`status = $${vals.length}`);
      }
      if (b.scheduled_at !== undefined) {
        vals.push(b.scheduled_at || null);
        sets.push(`scheduled_at = $${vals.length}`);
      }
      if (b.rules !== undefined) {
        vals.push(b.rules || null);
        sets.push(`rules = $${vals.length}`);
      }
      for (const f of ['sponsor_name', 'sponsor_link', 'sponsor_bio']) {
        if (b[f] !== undefined) {
          vals.push(b[f] || null);
          sets.push(`${f} = $${vals.length}`);
        }
      }
      if (b.spotlight !== undefined) {
        vals.push(!!b.spotlight);
        sets.push(`spotlight = $${vals.length}`);
      }
      if (!sets.length) {
        return res.status(400).json({ error: 'nothing to update (status, scheduled_at, rules, sponsor_*, spotlight)' });
      }
      const r = await query(`UPDATE giveaways SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
      if (!r.rows.length) return res.status(404).json({ error: 'not found' });
      const g = r.rows[0];
      // Sponsor edits apply to the live open draw immediately — no recreate needed.
      if (b.sponsor_name !== undefined || b.sponsor_link !== undefined || b.sponsor_bio !== undefined) {
        await query(
          `UPDATE draws SET sponsor_name = $2, sponsor_link = $3, sponsor_bio = $4
           WHERE giveaway_id = $1 AND status = 'entry_open'`,
          [req.params.id, g.sponsor_name, g.sponsor_link, g.sponsor_bio]
        );
      }
      res.json(g);
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

  // ---- Overview stats for the dashboard (resilient: missing tables read as 0) ----
  app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
    try {
      const scalar = async (text, fb) => {
        try {
          const r = await query(text);
          return Number(r.rows[0].c);
        } catch (_) {
          return fb;
        }
      };
      const [users, draws, tickets, winners, paidOut, pendingCount, pendingSum] = await Promise.all([
        scalar('SELECT COUNT(*)::int AS c FROM users', 0),
        scalar('SELECT COUNT(*)::int AS c FROM draws', 0),
        scalar('SELECT COUNT(*)::int AS c FROM tickets', 0),
        scalar('SELECT COUNT(*)::int AS c FROM draw_winners', 0),
        scalar('SELECT COALESCE(SUM(prize_amount),0)::int AS c FROM draw_winners', 0),
        scalar(`SELECT COUNT(*)::int AS c FROM withdrawals WHERE status = 'pending'`, 0),
        scalar(`SELECT COALESCE(SUM(amount),0)::int AS c FROM withdrawals WHERE status = 'pending'`, 0),
      ]);
      const giveaways = await query('SELECT * FROM giveaways ORDER BY id DESC LIMIT 50')
        .then((r) => r.rows)
        .catch(() => []);
      const recent = await store.getRecentResults(20).catch(() => []);
      const withdrawals = await query('SELECT * FROM withdrawals ORDER BY id DESC LIMIT 200')
        .then((r) => r.rows)
        .catch(() => []);
      res.json({
        ok: true,
        totals: { users, draws, tickets, winners, paidOut, pendingCount, pendingSum },
        giveaways,
        recent,
        withdrawals,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return app;
}

module.exports = { createAdminApp };

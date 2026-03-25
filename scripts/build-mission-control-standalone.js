#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = '/root/.openclaw/workspace';
const canvasDir = path.join(root, 'canvas');
const dataDir = path.join(canvasDir, 'data');

function readJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
}

const tasks = readJSON('tasks.json');
const memory = readJSON('memory.json');
const agents = readJSON('agents.json');
const prompts = readJSON('prompts.json');

const updatedAt = [tasks.updatedAt, memory.updatedAt, agents.updatedAt, prompts.updatedAt]
  .filter(Boolean)
  .sort()
  .pop() || new Date().toISOString();

const payload = { tasks, memory, agents, prompts, updatedAt };
const json = JSON.stringify(payload).replace(/</g, '\\u003c');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Jax Mission Control</title>
  <meta name="theme-color" content="#0b1118" />
  <style>
    :root {
      --bg: #070b11;
      --bg2: #101925;
      --panel: rgba(12, 18, 26, .84);
      --line: rgba(255,255,255,.08);
      --line2: rgba(255,255,255,.16);
      --text: #eef4fb;
      --muted: #93a3b8;
      --gold: #f6a521;
      --goldSoft: rgba(246,165,33,.12);
      --blue: #68a9ff;
      --blueSoft: rgba(104,169,255,.12);
      --green: #57e3a9;
      --greenSoft: rgba(87,227,169,.12);
      --red: #ff727a;
      --redSoft: rgba(255,114,122,.12);
      --shadow: 0 24px 80px rgba(0,0,0,.42);
      --grid: linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
    }
    body.light {
      --bg: #e8eff7;
      --bg2: #dce6f1;
      --panel: rgba(255,255,255,.84);
      --line: rgba(18,31,48,.10);
      --line2: rgba(18,31,48,.16);
      --text: #142031;
      --muted: #617184;
      --gold: #a76400;
      --goldSoft: rgba(167,100,0,.10);
      --blue: #185de3;
      --blueSoft: rgba(24,93,227,.10);
      --green: #0d9561;
      --greenSoft: rgba(13,149,97,.10);
      --red: #c64949;
      --redSoft: rgba(198,73,73,.10);
      --shadow: 0 20px 50px rgba(31,51,73,.14);
      --grid: linear-gradient(rgba(18,31,48,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(18,31,48,.04) 1px, transparent 1px);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      font: 500 15px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(246,165,33,.10), transparent 28%),
        radial-gradient(circle at top right, rgba(104,169,255,.10), transparent 24%),
        linear-gradient(180deg, var(--bg), var(--bg2));
      overflow-x: hidden;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      background-image: var(--grid);
      background-size: 28px 28px;
      opacity: .46;
      pointer-events: none;
      mask-image: linear-gradient(180deg, rgba(0,0,0,.9), rgba(0,0,0,.18));
    }
    .shell { max-width: 1240px; margin: 0 auto; padding: max(16px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom)) 16px; position: relative; z-index: 1; }
    .stack, .grid, .stats, .quick { display: grid; gap: 12px; }
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .quick { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .panel, .card, .metric { background: var(--panel); border: 1px solid var(--line); border-radius: 22px; box-shadow: var(--shadow); position: relative; overflow: hidden; }
    .panel::before, .card::before, .metric::before {
      content: ""; position: absolute; inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,.05), transparent 28%, transparent 72%, rgba(255,255,255,.03));
      pointer-events: none;
    }
    .inner { position: relative; z-index: 1; padding: 18px; }
    .eyebrow { display: inline-flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--line2); color: var(--muted); background: rgba(255,255,255,.03); text-transform: uppercase; letter-spacing: .16em; font-size: 11px; }
    .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 0 rgba(87,227,169,.4); animation: pulse 2s infinite; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(87,227,169,.4);} 70% { box-shadow: 0 0 0 10px rgba(87,227,169,0);} 100% { box-shadow: 0 0 0 0 rgba(87,227,169,0);} }
    h1 { margin: 14px 0 8px; font-size: clamp(2rem, 7vw, 4.1rem); line-height: .98; letter-spacing: -.05em; max-width: 10ch; }
    h2 { margin: 0; color: var(--muted); font-size: .92rem; letter-spacing: .14em; text-transform: uppercase; }
    h3 { margin: 0 0 6px; font-size: 1rem; }
    .subcopy, .muted { color: var(--muted); }
    .metric, .card { padding: 14px; }
    .metric .label { color: var(--muted); text-transform: uppercase; letter-spacing: .12em; font-size: 11px; }
    .metric .value { display: block; margin-top: 6px; font-size: 1.45rem; font-weight: 800; letter-spacing: -.04em; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    button, .chip { border: 1px solid var(--line); background: rgba(255,255,255,.03); color: var(--text); border-radius: 14px; padding: 10px 13px; font: inherit; }
    button:active { transform: scale(.99); }
    .row, .section-head { display: flex; justify-content: space-between; align-items: start; gap: 10px; }
    .list { display: grid; gap: 10px; }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .chip { padding: 7px 10px; font-size: .88rem; }
    .gold { border-color: rgba(246,165,33,.28); background: var(--goldSoft); }
    .blue { border-color: rgba(104,169,255,.28); background: var(--blueSoft); }
    .green { border-color: rgba(87,227,169,.28); background: var(--greenSoft); }
    .red { border-color: rgba(255,114,122,.28); background: var(--redSoft); }
    .prompt { padding: 12px 14px; border-radius: 14px; border: 1px dashed var(--line2); background: rgba(255,255,255,.02); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92rem; }
    .footer { text-align: center; color: var(--muted); font-size: .9rem; padding-top: 2px; }
    @media (max-width: 900px) { .grid, .quick { grid-template-columns: 1fr; } .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 520px) { .inner { padding: 16px; } .stats { grid-template-columns: 1fr 1fr; } h1 { max-width: 100%; } }
  </style>
</head>
<body>
  <div class="shell stack">
    <section class="panel"><div class="inner">
      <div class="eyebrow"><span class="pulse"></span> Jax Mission Control</div>
      <h1>One board. Whole operation.</h1>
      <div class="subcopy">Phone-ready, auto-published, and rebuilt from live workspace + session state instead of a stale one-off snapshot.</div>
      <div class="stats">
        <div class="metric"><div class="label">Active tasks</div><span class="value" id="metricActive">—</span></div>
        <div class="metric"><div class="label">Completed</div><span class="value" id="metricCompleted">—</span></div>
        <div class="metric"><div class="label">Memory items</div><span class="value" id="metricMemory">—</span></div>
        <div class="metric"><div class="label">Visible sessions</div><span class="value" id="metricSessions">—</span></div>
      </div>
      <div class="toolbar">
        <button id="themeBtn">Toggle theme</button>
        <button id="scrollTasks">Tasks</button>
        <button id="scrollMemory">Memory</button>
        <button id="scrollAgents">Agents</button>
        <button id="scrollPrompts">Prompts</button>
      </div>
    </div></section>

    <section class="quick">
      <div class="metric"><div class="label">Priority queue</div><span class="value" id="priorityValue">—</span><div class="muted" id="priorityNote">—</div></div>
      <div class="metric"><div class="label">Publish state</div><span class="value" id="publishValue">—</span><div class="muted" id="publishNote">—</div></div>
      <div class="metric"><div class="label">Updated</div><span class="value" id="updatedValue">—</span><div class="muted">Auto-published phone view</div></div>
    </section>

    <main class="grid">
      <section class="panel" id="tasksSection"><div class="inner"><div class="section-head"><h2>Task Rollup</h2><div class="muted" id="taskSummary">—</div></div><div class="list" id="taskList"></div></div></section>
      <section class="panel" id="memorySection"><div class="inner"><div class="section-head"><h2>Memory Rollup</h2><div class="muted" id="memorySummary">—</div></div><div class="list" id="memoryList"></div></div></section>
      <section class="panel" id="agentsSection"><div class="inner"><div class="section-head"><h2>Agent Visibility</h2><div class="muted">live-ish signal</div></div><div class="list" id="agentList"></div></div></section>
      <section class="panel" id="promptsSection"><div class="inner"><div class="section-head"><h2>Control Prompts</h2><div class="muted">ask in plain English</div></div><div class="list" id="promptSections"></div></div></section>
    </main>

    <div class="footer">Generated from workspace/canvas/data · replace-in-place publishing keeps the same Drive link alive.</div>
  </div>

  <script id="mission-control-data" type="application/json">${json}</script>
  <script>
    const data = JSON.parse(document.getElementById('mission-control-data').textContent);
    const $ = (s) => document.querySelector(s);
    function badgeClass(v = '') {
      const x = String(v).toLowerCase();
      if (['high','active','important'].includes(x)) return 'gold';
      if (['medium','review'].includes(x)) return 'blue';
      if (['complete','completed','good','recent'].includes(x)) return 'green';
      if (['low','overdue','blocked'].includes(x)) return 'red';
      return 'blue';
    }
    function shortTime(iso) {
      return String(iso || '').replace('T', ' ').replace('Z', ' UTC');
    }
    function renderTasks(tasks) {
      $('#metricActive').textContent = tasks.summary.active;
      $('#metricCompleted').textContent = tasks.summary.completed;
      $('#priorityValue').textContent = tasks.active.filter(t => t.priority === 'high').length;
      $('#priorityNote').textContent = tasks.active[0]?.title || 'No active task';
      $('#taskSummary').textContent = tasks.active.length + ' active / ' + tasks.completed.length + ' completed';
      $('#taskList').innerHTML = tasks.active.map(item => '\n        <article class="card">\n          <div class="row">\n            <div>\n              <h3>' + item.title + '</h3>\n              <div class="muted">' + item.notes + '</div>\n            </div>\n            <span class="chip ' + badgeClass(item.priority) + '">' + item.priority + '</span>\n          </div>\n          <div class="chips">\n            <span class="chip blue">' + item.project + '</span>\n            <span class="chip green">Owner: ' + item.owner + '</span>\n            <span class="chip gold">Target: ' + item.deadline + '</span>\n          </div>\n        </article>').join('');
    }
    function renderMemory(memory) {
      $('#metricMemory').textContent = memory.recent.length;
      $('#memorySummary').textContent = memory.recent.length + ' recent / ' + memory.categories.length + ' categories';
      $('#memoryList').innerHTML = memory.recent.map(item => '\n        <article class="card">\n          <div class="row">\n            <div>\n              <h3>' + item.title + '</h3>\n              <div class="muted">' + item.note + '</div>\n            </div>\n            <span class="chip ' + badgeClass(item.importance) + '">' + item.importance + '</span>\n          </div>\n          <div class="chips">\n            <span class="chip blue">' + item.category + '</span>\n            <span class="chip green">' + item.project + '</span>\n            <span class="chip gold">' + item.when + '</span>\n          </div>\n        </article>').join('');
    }
    function renderAgents(agents) {
      $('#metricSessions').textContent = agents.overview.sessionCount || agents.overview.activeAgents || 0;
      $('#publishValue').textContent = agents.agents[0]?.status || '—';
      $('#publishNote').textContent = agents.agents[0]?.recentActions?.[1] || 'No publish note';
      $('#agentList').innerHTML = agents.agents.map(agent => '\n        <article class="card">\n          <div class="row">\n            <div>\n              <h3>' + agent.name + ' · ' + agent.role + '</h3>\n              <div class="muted">' + agent.currentWork + '</div>\n            </div>\n            <span class="chip ' + badgeClass(agent.status) + '">' + agent.status + '</span>\n          </div>\n          <div class="chips">\n            <span class="chip gold">Visibility: ' + agent.visibility + '</span>\n            <span class="chip blue">Sessions: ' + (agent.metrics?.sessionsVisible ?? 'n/a') + '</span>\n            <span class="chip green">Newest: ' + (agent.metrics?.newestSessionAge ?? 'n/a') + '</span>\n            <span class="chip blue">Tokens: ' + (agent.metrics?.tokenUse ?? 'n/a') + '</span>\n          </div>\n          <div class="card" style="margin-top:12px">\n            <strong style="display:block;margin-bottom:8px">Recent actions</strong>\n            <div class="muted">• ' + agent.recentActions.join('<br>• ') + '</div>\n          </div>\n        </article>').join('');
    }
    function renderPrompts(prompts) {
      const groups = [
        ['Task prompts', prompts.taskPrompts],
        ['Memory prompts', prompts.memoryPrompts],
        ['Agent prompts', prompts.agentPrompts],
        ['Control prompts', prompts.controlPrompts],
      ];
      $('#promptSections').innerHTML = groups.map(([title, items]) => '\n        <article class="card">\n          <h3>' + title + '</h3>\n          <div class="list">' + items.map(item => '<div class="prompt">' + item + '</div>').join('') + '</div>\n        </article>').join('');
    }
    function boot() {
      $('#updatedValue').textContent = shortTime(data.updatedAt);
      renderTasks(data.tasks);
      renderMemory(data.memory);
      renderAgents(data.agents);
      renderPrompts(data.prompts);
    }
    $('#themeBtn').addEventListener('click', () => document.body.classList.toggle('light'));
    $('#scrollTasks').addEventListener('click', () => $('#tasksSection').scrollIntoView({behavior:'smooth'}));
    $('#scrollMemory').addEventListener('click', () => $('#memorySection').scrollIntoView({behavior:'smooth'}));
    $('#scrollAgents').addEventListener('click', () => $('#agentsSection').scrollIntoView({behavior:'smooth'}));
    $('#scrollPrompts').addEventListener('click', () => $('#promptsSection').scrollIntoView({behavior:'smooth'}));
    boot();
  </script>
</body>
</html>`;

const out = path.join(canvasDir, 'mission-control-standalone.html');
fs.writeFileSync(out, html);
console.log(out);

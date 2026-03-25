#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const CANVAS_DIR = path.join(WORKSPACE, 'canvas');
const DATA_DIR = path.join(CANVAS_DIR, 'data');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const SESSIONS_PATH = '/root/.openclaw/agents/main/sessions/sessions.json';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeJSON(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2) + '\n');
}

function sh(cmd) {
  return cp.execFileSync('bash', ['-lc', cmd], { encoding: 'utf8' }).trim();
}

function nowIso() {
  return sh('date -u +%Y-%m-%dT%H:%M:%SZ');
}

function latestMemoryFile() {
  const files = fs.readdirSync(MEMORY_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort();
  if (!files.length) throw new Error('No daily memory files found.');
  return path.join(MEMORY_DIR, files[files.length - 1]);
}

function parseCheckpoint(md) {
  const line = (label) => {
    const m = md.match(new RegExp(`\\n- ${label}:\\s*(.*)$`, 'm'));
    return m ? m[1].trim() : '';
  };
  const block = (label) => {
    const m = md.match(new RegExp(`\\n- ${label}:\\n([\\s\\S]*?)(?=\\n- [A-Z][^:\\n]*:|\\n## |$)`));
    if (!m) return '';
    return m[1].split(/\r?\n/).map(s => s.replace(/^\s*-\s*/, '').trim()).filter(Boolean).join(' | ');
  };
  return {
    task: line('Task'),
    status: line('Status'),
    nextStep: block('Next step') || line('Next step'),
    blockedBy: block('Blocked by') || line('Blocked by') || 'none',
    resumeCue: line('Resume cue'),
    done: block('Done') || line('Done')
  };
}

function parseConversationSummaries(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^## Conversation Summary —\s+(.*)$/);
    if (!m) continue;
    const row = { time: m[1].trim(), topic: '', asked: '', did: '', status: '', next: '', tags: '' };
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (/^## /.test(line)) break;
      let x;
      if ((x = line.match(/^- Topic:\s*(.*)$/))) row.topic = x[1].trim();
      else if ((x = line.match(/^- Bryon asked:\s*(.*)$/))) row.asked = x[1].trim();
      else if ((x = line.match(/^- Jax did:\s*(.*)$/))) row.did = x[1].trim();
      else if ((x = line.match(/^- Status:\s*(.*)$/))) row.status = x[1].trim();
      else if ((x = line.match(/^- Next step:\s*(.*)$/))) row.next = x[1].trim();
      else if ((x = line.match(/^- Tags:\s*(.*)$/))) row.tags = x[1].trim();
    }
    out.push(row);
  }
  return out;
}

function parseTaskRetros(md) {
  const blocks = md.split(/^## Task Retrospective/m).slice(1);
  return blocks.map((block) => {
    const val = (label) => {
      const m = block.match(new RegExp(`\\n- ${label}:\\s*([\\s\\S]*?)(?=\\n- [A-Z][^:\\n]*:|$)`));
      return m ? m[1].replace(/\n\s+/g, ' ').trim() : '';
    };
    return {
      task: val('Task'),
      status: val('Status'),
      improve: val('Improve'),
      lockIn: val('Lock in')
    };
  }).filter(Boolean);
}

function minutesAgo(ms) {
  const diff = Math.max(0, Date.now() - Number(ms || 0));
  return Math.round(diff / 60000);
}

function humanAgeMinutes(mins) {
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return `${h}h ago`;
}

function futureMinutesText(targetMs) {
  if (!targetMs) return 'scheduled';
  const diffMin = Math.max(1, Math.round((Number(targetMs) - Date.now()) / 60000));
  if (diffMin < 60) return `in ${diffMin}m`;
  return `in ${Math.round(diffMin / 60)}h`;
}

function loadSessions() {
  return JSON.parse(read(SESSIONS_PATH));
}

function loadStatus() {
  return JSON.parse(sh('openclaw status --json'));
}

function loadCronJobs() {
  return JSON.parse(sh('openclaw cron list --json')).jobs || [];
}

function buildTasks(checkpoint, summaries, retros, cronJobs) {
  const publishJob = cronJobs.find(j => /mission control/i.test(j.name || ''));
  const dashboardJob = cronJobs.find(j => /dashboard refresh/i.test(j.name || ''));
  const active = [];

  if (checkpoint.task) {
    active.push({
      id: 'checkpoint-primary',
      title: checkpoint.task,
      status: 'active',
      priority: checkpoint.blockedBy && checkpoint.blockedBy !== 'none' ? 'medium' : 'high',
      deadline: checkpoint.resumeCue || 'Next handoff',
      owner: 'Jax',
      project: 'Primary Checkpoint',
      notes: checkpoint.nextStep || checkpoint.status,
      source: 'CHECKPOINT.md'
    });
  }

  active.push({
    id: 'mission-control-publish',
    title: 'Keep Mission Control published and current',
    status: 'active',
    priority: 'high',
    deadline: publishJob?.state?.nextRunAtMs ? futureMinutesText(publishJob.state.nextRunAtMs) : '15m cadence',
    owner: 'Jax',
    project: 'Mission Control OS',
    notes: publishJob
      ? `Auto-publish job is ${publishJob.enabled ? 'enabled' : 'disabled'}; last run ${publishJob.state?.lastRunStatus || 'unknown'}; next refresh scheduled automatically.`
      : 'Publish flow exists locally and should be scheduled.',
    source: publishJob ? `cron:${publishJob.id}` : 'scripts/publish-mission-control.sh'
  });

  const latestMission = [...summaries].reverse().find(s => /mission control/i.test(`${s.topic} ${s.tags} ${s.did}`));
  active.push({
    id: 'mission-control-evolution',
    title: 'Expand Mission Control with fresher rollups and cleaner mobile UX',
    status: 'active',
    priority: 'high',
    deadline: 'Now',
    owner: 'Jax',
    project: 'Mission Control OS',
    notes: latestMission?.next || 'Improve live agent visibility, task rollups, and phone ergonomics without making the stack heavy.',
    source: latestMission ? 'memory/latest conversation summary' : 'workspace'
  });

  if (dashboardJob) {
    active.push({
      id: 'dashboard-refresh',
      title: 'Maintain the broader dashboard refresh automation',
      status: 'active',
      priority: 'medium',
      deadline: dashboardJob.state?.nextRunAtMs ? futureMinutesText(dashboardJob.state.nextRunAtMs) : '30m cadence',
      owner: 'Jax',
      project: 'Dashboard System',
      notes: `Legacy dashboard refresh job is ${dashboardJob.enabled ? 'enabled' : 'disabled'} and last run status is ${dashboardJob.state?.lastRunStatus || 'unknown'}.`,
      source: `cron:${dashboardJob.id}`
    });
  }

  const completed = retros.slice(-8).reverse().map((r, idx) => ({
    id: `retro-${idx + 1}`,
    title: r.task || 'Completed task',
    completedOn: new Date().toISOString().slice(0, 10),
    project: /mission control/i.test(r.task || '') ? 'Mission Control OS' : (/dashboard/i.test(r.task || '') ? 'Dashboard' : 'Operations')
  }));

  return {
    updatedAt: nowIso(),
    summary: {
      active: active.length,
      completed: completed.length,
      overdue: 0,
      dueSoon: active.filter(t => /now|m ago|cadence|reply|today|soon/i.test(t.deadline)).length
    },
    active,
    completed
  };
}

function buildMemory(summaries, retros, checkpoint) {
  const missionItems = summaries.slice(-4).reverse().map((s) => ({
    title: s.topic || 'Recent memory update',
    category: (s.tags || '').split(',')[0]?.trim() || 'memory',
    project: /mission control/i.test(`${s.topic} ${s.tags}`) ? 'Mission Control OS' : 'Workspace',
    when: s.time || 'today',
    importance: /complete|checkpointed|active/i.test(s.status) ? 'high' : 'medium',
    note: s.did || s.asked || s.next || 'Recent operating note.'
  }));

  missionItems.unshift({
    title: 'Primary checkpoint',
    category: 'checkpoint',
    project: 'Primary Checkpoint',
    when: 'now',
    importance: 'high',
    note: checkpoint.task ? `${checkpoint.task} — ${checkpoint.status}` : 'No primary checkpoint set.'
  });

  const improvements = retros.slice(-3).reverse().map((r) => r.improve).filter(Boolean);

  return {
    updatedAt: nowIso(),
    recent: missionItems.slice(0, 6),
    categories: [
      { name: 'mission-control', count: missionItems.filter(i => /Mission Control/i.test(i.project)).length, description: 'Dashboard state, publishing, mobile access, live rollups' },
      { name: 'checkpoint', count: 1, description: 'Current primary task and next-step continuity' },
      { name: 'operations', count: improvements.length, description: 'Process tweaks and lessons being locked in' },
      { name: 'automation', count: 2, description: 'Cron-backed publishing and recurring dashboard upkeep' }
    ],
    highlighted: [
      'Mission Control should stay tangible: easy to pull up on a phone without depending on local network reachability.',
      'Keep the stack simple: generate fresher rollups from files and session state instead of inventing a heavyweight app.',
      improvements[0] || 'Prefer reusable one-command publish flows over manual refresh routines.'
    ],
    sources: ['CHECKPOINT.md', 'memory/latest', 'openclaw status --json', 'openclaw cron list --json']
  };
}

function buildAgents(status, sessions, cronJobs) {
  const recent = status.sessions?.recent || [];
  const activeSessions = recent.slice(0, 4).map((s) => ({
    key: s.key,
    kind: s.kind,
    ageMinutes: minutesAgo(s.updatedAt),
    ageText: humanAgeMinutes(minutesAgo(s.updatedAt)),
    model: s.model,
    percentUsed: s.percentUsed,
    tokens: s.totalTokens
  }));

  const missionCron = cronJobs.find(j => /mission control/i.test(j.name || ''));
  const agent = {
    name: 'Jax',
    role: 'Main operator',
    status: activeSessions.some(s => s.ageMinutes < 30) ? 'active' : 'review',
    currentWork: 'Maintaining Mission Control, publishing the phone view, and keeping task/memory rollups fresh from live workspace state.',
    recentActions: [
      `Latest chat session ${activeSessions[0]?.ageText || 'recently'} on ${activeSessions[0]?.model || 'gpt-5.4'}`,
      missionCron ? `Mission Control auto-publish job last run: ${missionCron.state?.lastRunStatus || 'unknown'}` : 'Mission Control publish flow is available locally',
      `Session count visible: ${status.sessions?.count || 0}; gateway service ${status.gatewayService?.runtimeShort || 'unknown'}`
    ],
    visibility: 'High',
    notes: `Top visible session: ${activeSessions[0]?.key || 'n/a'}`,
    metrics: {
      sessionsVisible: activeSessions.length,
      newestSessionAge: activeSessions[0]?.ageText || 'n/a',
      tokenUse: activeSessions[0]?.percentUsed != null ? `${activeSessions[0].percentUsed}%` : 'n/a'
    }
  };

  return {
    updatedAt: nowIso(),
    overview: {
      activeAgents: 1,
      idleAgents: 0,
      lastReview: 'now',
      sessionCount: status.sessions?.count || 0,
      cronCount: cronJobs.length
    },
    agents: [agent],
    viewerNotes: [
      'Agent visibility is generated from current OpenClaw session state and cron status, not hand-written only.',
      'This favors usable signal on a phone: what is active, when it last moved, and whether automation is healthy.',
      'Side agents can be added later once they become part of the normal operating loop.'
    ]
  };
}

function buildPrompts() {
  return {
    updatedAt: nowIso(),
    taskPrompts: [
      'Add this as a task in Mission Control: [task text]',
      'What is the top priority right now?',
      'What is blocked?',
      'Mark [task name] complete',
      'Show me what needs attention next'
    ],
    memoryPrompts: [
      'What changed today?',
      'Show recent memory updates',
      'What do we know about [project/topic]?',
      'Promote this to long-term memory: [note]',
      'What should I pick back up next?'
    ],
    agentPrompts: [
      'What has Jax been doing today?',
      'Show live agent status',
      'Show recent session rollups',
      'Is the publish automation healthy?'
    ],
    controlPrompts: [
      'Publish Mission Control now',
      'Refresh the dashboard data',
      'Give me the operating picture',
      'Open Mission Control'
    ]
  };
}

const checkpoint = parseCheckpoint(read(path.join(WORKSPACE, 'CHECKPOINT.md')));
const latestMemory = read(latestMemoryFile());
const summaries = parseConversationSummaries(latestMemory);
const retros = parseTaskRetros(latestMemory);
const status = loadStatus();
const sessions = loadSessions();
const cronJobs = loadCronJobs();

writeJSON('tasks.json', buildTasks(checkpoint, summaries, retros, cronJobs));
writeJSON('memory.json', buildMemory(summaries, retros, checkpoint));
writeJSON('agents.json', buildAgents(status, sessions, cronJobs));
writeJSON('prompts.json', buildPrompts());

console.log('Mission Control data synced.');

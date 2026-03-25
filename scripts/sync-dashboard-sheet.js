#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const SHEET_ID = '1H3qzCL6r4vtI0YxSgtrrrxcKIo8uUIKp-72MitYiPoI';
const ACCOUNT = 'rompabryon@gmail.com';
const MEMORY_DIR = path.join(WORKSPACE, 'memory');

function read(rel) {
  return fs.readFileSync(path.join(WORKSPACE, rel), 'utf8');
}

function shellQuote(str) {
  return `'${String(str).replace(/'/g, `'"'"'`)}'`;
}

function getLatestMemoryFile() {
  const files = fs.readdirSync(MEMORY_DIR)
    .filter(name => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort();
  if (!files.length) throw new Error('No daily memory files found in memory/.');
  return files[files.length - 1];
}

function parseConversationSummaries(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].match(/^## Conversation Summary —\s+(.*)$/);
    if (!header) continue;
    const timeUTC = header[1].trim();
    const row = { Date: '', TimeUTC: timeUTC, Topic: '', Summary: '', Status: '', NextStep: '', Tags: '', Anchor: '' };
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (/^## /.test(line)) break;
      let m;
      if ((m = line.match(/^- Topic:\s*(.*)$/))) row.Topic = m[1].trim();
      else if ((m = line.match(/^- Jax did:\s*(.*)$/))) row.Summary = m[1].trim();
      else if ((m = line.match(/^- Status:\s*(.*)$/))) row.Status = m[1].trim();
      else if ((m = line.match(/^- Next step:\s*(.*)$/))) row.NextStep = m[1].trim();
      else if ((m = line.match(/^- Tags:\s*(.*)$/))) row.Tags = m[1].trim();
    }
    out.push(row);
  }
  return out;
}

function parseDayOverviewDate(md) {
  const m = md.match(/^#\s+(\d{4}-\d{2}-\d{2})/m);
  return m ? m[1] : '';
}

function parseProjects(md) {
  const blocks = md.split(/^##\s+/m).slice(1);
  return blocks.map(block => {
    const lines = block.split(/\r?\n/);
    const project = lines[0].trim();
    const joined = '\n' + lines.slice(1).join('\n');
    const pick = (label) => {
      const m = joined.match(new RegExp(`\\n- ${label}:\\s*([\\s\\S]*?)(?=\\n- [A-Z][^:\\n]*:|$)`));
      return m ? m[1].replace(/\n\s*-\s*/g, '|').replace(/`/g, '').trim() : '';
    };
    return {
      Project: project,
      Status: pick('Status'),
      Summary: '',
      RecentActivity: pick('Recent activity dates'),
      NextStep: pick('Next step'),
      Tags: (pick('Related tags').match(/`([^`]+)`/g) || []).map(s => s.replace(/`/g, '')).join(',')
    };
  }).filter(p => p.Project && !/^How to use$/i.test(p.Project));
}

function fillProjectSummaries(projects) {
  const map = {
    'Daily Memory Dashboard': 'Operating system for daily logs, recall, summaries, and continuity.',
    'Gratitude Workflow': 'Daily gratitude capture workflow tied to Google Sheets and reminder automation.',
    'Google / GOG Setup': 'Google auth and API access foundation for Gmail, Calendar, Drive, Docs, and Sheets work.'
  };
  return projects.map(p => ({ ...p, Summary: map[p.Project] || p.Summary || 'Recurring workspace project.' }));
}

function parseTags(md) {
  return md.split(/\r?\n/)
    .map(line => line.match(/^- `([^`]+)`\s+—\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({ Tag: m[1], Group: inferTagGroup(m[1]), Notes: m[2].trim() }));
}

function inferTagGroup(tag) {
  if (['memory','logging','continuity'].includes(tag)) return 'system';
  if (['dashboard'].includes(tag)) return 'ui';
  if (['gog','google-auth','gmail','calendar','drive','docs','google-sheets'].includes(tag)) return 'google';
  if (['gratitude','cron'].includes(tag)) return 'workflow';
  if (['gateway','ssh'].includes(tag)) return 'infra';
  if (['telegram'].includes(tag)) return 'channel';
  if (['timezone'].includes(tag)) return 'prefs';
  return 'other';
}

function parseCheckpoint(md) {
  const get = (label) => {
    const m = md.match(new RegExp(`\\n- ${label}:\\n([\\s\\S]*?)(?=\\n- [A-Z][^:\\n]*:|\\n## |$)`));
    if (!m) {
      const single = md.match(new RegExp(`\\n- ${label}:\\s*(.*)$`, 'm'));
      return single ? single[1].trim() : '';
    }
    return m[1].split(/\r?\n/).map(s => s.replace(/^\s*-\s*/, '').trim()).filter(Boolean).join(' | ');
  };
  const task = (md.match(/\n- Task:\s*(.*)$/m) || [,''])[1].trim();
  const status = (md.match(/\n- Status:\s*(.*)$/m) || [,''])[1].trim();
  const resumeCue = (md.match(/\n- Resume cue:\s*(.*)$/m) || [,''])[1].trim();
  return [{
    Title: task,
    Status: status,
    Done: get('Done'),
    BlockedBy: get('Blocked by') || 'none',
    NextStep: get('Next step'),
    Tags: 'gratitude,gog,google-sheets,cron,telegram',
    ResumeCue: resumeCue
  }];
}

function toRows(headers, objects) {
  return [headers, ...objects.map(obj => headers.map(h => obj[h] || ''))];
}

function writeJsonTemp(name, data) {
  const file = path.join(WORKSPACE, 'tmp', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
}

function run(cmd) {
  cp.execFileSync('bash', ['-lc', cmd], { stdio: 'inherit' });
}

const latestMemoryFile = getLatestMemoryFile();
const mem = read(path.join('memory', latestMemoryFile));
const logDate = parseDayOverviewDate(mem) || latestMemoryFile.replace(/\.md$/, '');
const logs = parseConversationSummaries(mem).map((row, idx) => ({ ...row, Date: logDate, Anchor: `highlight-${logDate}-${idx + 1}` }));
const projects = fillProjectSummaries(parseProjects(read('PROJECT_INDEX.md')));
const tags = parseTags(read('TAG_INDEX.md'));
const checkpoint = parseCheckpoint(read('CHECKPOINT.md'));

const payloads = {
  logs: toRows(['Date','TimeUTC','Topic','Summary','Status','NextStep','Tags','Anchor'], logs),
  projects: toRows(['Project','Status','Summary','RecentActivity','NextStep','Tags'], projects),
  tags: toRows(['Tag','Group','Notes'], tags),
  checkpoint: toRows(['Title','Status','Done','BlockedBy','NextStep','Tags','ResumeCue'], checkpoint),
};

const files = {
  logs: writeJsonTemp('dashboard-logs.json', payloads.logs),
  projects: writeJsonTemp('dashboard-projects.json', payloads.projects),
  tags: writeJsonTemp('dashboard-tags.json', payloads.tags),
  checkpoint: writeJsonTemp('dashboard-checkpoint.json', payloads.checkpoint),
};

run(`source /root/.config/gog/env && \
  gog sheets clear ${SHEET_ID} 'Logs!A:Z' --account ${ACCOUNT} && \
  gog sheets update ${SHEET_ID} 'Logs!A1' --values-json ${shellQuote(fs.readFileSync(files.logs, 'utf8'))} --input USER_ENTERED --account ${ACCOUNT} && \
  gog sheets clear ${SHEET_ID} 'Projects!A:Z' --account ${ACCOUNT} && \
  gog sheets update ${SHEET_ID} 'Projects!A1' --values-json ${shellQuote(fs.readFileSync(files.projects, 'utf8'))} --input USER_ENTERED --account ${ACCOUNT} && \
  gog sheets clear ${SHEET_ID} 'Tags!A:Z' --account ${ACCOUNT} && \
  gog sheets update ${SHEET_ID} 'Tags!A1' --values-json ${shellQuote(fs.readFileSync(files.tags, 'utf8'))} --input USER_ENTERED --account ${ACCOUNT} && \
  gog sheets clear ${SHEET_ID} 'Checkpoint!A:Z' --account ${ACCOUNT} && \
  gog sheets update ${SHEET_ID} 'Checkpoint!A1' --values-json ${shellQuote(fs.readFileSync(files.checkpoint, 'utf8'))} --input USER_ENTERED --account ${ACCOUNT}`);

console.log(`Dashboard sheet synced from ${latestMemoryFile}.`);

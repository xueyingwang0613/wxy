#!/usr/bin/env node

import { createReadStream, existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const bundledSite = path.resolve(scriptDir, '..', 'assets', 'site');
const localOutput = path.resolve(scriptDir, '..');
const localConfigFile = path.join(localOutput, 'review-config.json');

const parseArgs = argv => {
  const result = { force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--force') result.force = true;
    else if (['--start', '--end', '--output'].includes(value)) {
      if (!argv[index + 1]) throw new Error(`${value} 缺少参数`);
      result[value.slice(2)] = argv[++index];
    } else if (value === '--help' || value === '-h') result.help = true;
    else throw new Error(`未知参数：${value}`);
  }
  return result;
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log('用法：node generate-review.mjs [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--output DIR] [--force]');
  process.exit(0);
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
const dateParts = date => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
};
const localDate = value => {
  const parts = dateParts(new Date(value));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const today = localDate(new Date());
const defaultStart = (() => {
  const parts = dateParts(new Date());
  const month = Number(parts.month) === 1 ? 12 : Number(parts.month) - 1;
  const year = Number(parts.month) === 1 ? Number(parts.year) - 1 : Number(parts.year);
  return `${year}-${String(month).padStart(2, '0')}-01`;
})();
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

let savedConfig = null;
if (!existsSync(bundledSite) && existsSync(localConfigFile)) {
  savedConfig = JSON.parse(await fs.readFile(localConfigFile, 'utf8'));
}
const rollingDefault = savedConfig ? Boolean(savedConfig.rollingDefault) : !args.start && !args.end;
const startDate = args.start || (rollingDefault ? defaultStart : savedConfig?.startDate) || defaultStart;
const endDate = args.end || (rollingDefault ? today : savedConfig?.endDate) || today;
if (!validDate(startDate) || !validDate(endDate)) throw new Error('日期必须是 YYYY-MM-DD');
if (startDate > endDate) throw new Error('开始日期不能晚于结束日期');

const outputRoot = path.resolve(args.output || (savedConfig ? localOutput : path.join(process.cwd(), 'codex-work-review')));
const configFile = path.join(outputRoot, 'review-config.json');
const sessionsRoot = path.join(os.homedir(), '.codex', 'sessions');
const codexAuthFile = path.join(os.homedir(), '.codex', 'auth.json');

const readCodexUserName = async () => {
  try {
    const auth = JSON.parse(await fs.readFile(codexAuthFile, 'utf8'));
    const token = auth.tokens?.id_token;
    if (!token) return null;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null;
  } catch {
    return null;
  }
};

const cleanRequest = value => {
  let text = String(value || '').trim();
  if (text.includes('## My request for Codex:')) text = text.split('## My request for Codex:').at(-1);
  return text
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/g, '')
    .replace(/# Files mentioned by the user:[\s\S]*?(?=## My request for Codex:|$)/g, '')
    .replace(/# In app browser:[\s\S]*?(?=## My request for Codex:|$)/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const categories = [
  { id: 'content', letter: 'A', name: '内容与 Skill', pattern: /小红书|笔记|正文|选题|skill|内容|文章|文案|公众号/i },
  { id: 'web', letter: 'B', name: '网页与代码', pattern: /网页|网站|页面|前端|代码|react|html|css|javascript|bug|修复|部署/i },
  { id: 'visual', letter: 'C', name: '视觉与图片', pattern: /图片|海报|封面|配色|视觉|生图|4k|图像|插画|logo/i },
  { id: 'docs', letter: 'D', name: '文档与演示', pattern: /报告|ppt|幻灯片|文档|表格|pdf|word|飞书/i },
  { id: 'research', letter: 'E', name: '研究与规划', pattern: /研究|分析|调研|规划|策略|复盘|统计|方案/i },
  { id: 'other', letter: 'F', name: '其他任务', pattern: /.*/ }
];
const classify = text => categories.find(category => category.pattern.test(text)) || categories.at(-1);
const describeRequests = requests => {
  const unique = [...new Set(requests.map(cleanRequest).filter(Boolean))];
  const joined = unique.join(' ');
  const category = classify(joined);
  const snippets = unique.slice(0, 3).map(text => text.length > 56 ? `${text.slice(0, 56)}…` : text);
  return {
    title: unique.length ? category.name : '无可读取会话',
    summary: snippets.length ? snippets.join('；') : '当天未找到可展示的主会话记录。'
  };
};

const walkJsonl = async directory => {
  const files = [];
  if (!existsSync(directory)) return files;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkJsonl(target));
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(target);
  }
  return files;
};

const dayMap = new Map();
const projectMap = new Map(categories.map(category => [category.id, {
  ...category, sessions: 0, messages: 0, total: 0, effective: 0, requests: []
}]));
let sessionCount = 0;

for (const file of await walkJsonl(sessionsRoot)) {
  const input = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let isMainSession = null;
  const pending = [];
  const session = { messages: 0, total: 0, effective: 0, requests: [], hasRangeData: false };

  const consume = record => {
    if (record.type !== 'event_msg') return;
    const day = localDate(record.timestamp);
    if (day < startDate || day > endDate) return;
    session.hasRangeData = true;
    const item = dayMap.get(day) || { date: day, messages: 0, total: 0, effective: 0, requests: [] };
    if (record.payload?.type === 'user_message') {
      const request = record.payload.message || '';
      item.messages += 1;
      item.requests.push(request);
      session.messages += 1;
      session.requests.push(request);
    }
    if (record.payload?.type === 'token_count') {
      const usage = record.payload.info?.last_token_usage;
      if (usage) {
        const total = usage.total_tokens || 0;
        const effective = (usage.input_tokens || 0) - (usage.cached_input_tokens || 0) + (usage.output_tokens || 0);
        item.total += total;
        item.effective += effective;
        session.total += total;
        session.effective += effective;
      }
    }
    dayMap.set(day, item);
  };

  for await (const line of input) {
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    if (isMainSession === null && record.type === 'session_meta') {
      isMainSession = typeof record.payload?.source === 'string';
      if (isMainSession) pending.splice(0).forEach(consume);
      else pending.length = 0;
      continue;
    }
    if (isMainSession === null) pending.push(record);
    else if (isMainSession) consume(record);
  }

  if (isMainSession && session.hasRangeData) {
    sessionCount += 1;
    const category = classify(session.requests.map(cleanRequest).join(' '));
    const project = projectMap.get(category.id);
    project.sessions += 1;
    project.messages += session.messages;
    project.total += session.total;
    project.effective += session.effective;
    project.requests.push(...session.requests);
  }
}

for (let cursor = Date.parse(`${startDate}T00:00:00Z`); cursor <= Date.parse(`${endDate}T00:00:00Z`); cursor += 86400000) {
  const date = new Date(cursor).toISOString().slice(0, 10);
  if (!dayMap.has(date)) dayMap.set(date, { date, messages: 0, total: 0, effective: 0, requests: [] });
}

const daily = [...dayMap.values()]
  .sort((a, b) => a.date.localeCompare(b.date))
  .map(item => ({ ...item, ...describeRequests(item.requests), requests: undefined }));
const totals = daily.reduce((sum, item) => ({
  messages: sum.messages + item.messages,
  total: sum.total + item.total,
  effective: sum.effective + item.effective,
  active: sum.active + Number(item.messages > 0)
}), { messages: 0, total: 0, effective: 0, active: 0 });

const weeks = [];
for (let index = 0; index < daily.length; index += 7) {
  const rows = daily.slice(index, index + 7);
  const sum = rows.reduce((value, item) => ({
    messages: value.messages + item.messages,
    total: value.total + item.total,
    effective: value.effective + item.effective
  }), { messages: 0, total: 0, effective: 0 });
  const activeRows = rows.filter(row => row.messages > 0);
  const focus = activeRows.sort((a, b) => b.messages - a.messages)[0]?.title || '无会话记录';
  weeks.push({
    range: `${rows[0].date.slice(5).replace('-', '.')}—${rows.at(-1).date.slice(5).replace('-', '.')}`,
    focus,
    note: activeRows.length ? `${activeRows.length} 个活跃日，按本地主会话自动汇总。` : '本周期未找到主会话记录。',
    ...sum
  });
}

const projects = [...projectMap.values()].map(project => {
  const description = describeRequests(project.requests);
  return {
    id: project.id,
    letter: project.letter,
    name: project.name,
    sessions: project.sessions,
    messages: project.messages,
    total: project.total,
    effective: project.effective,
    summary: description.summary,
    status: project.sessions ? '有活动记录' : '本期无记录'
  };
}).filter(project => project.sessions > 0);

const payload = {
  generatedAt: new Date().toISOString(),
  codexUserName: await readCodexUserName(),
  dataCutoff: endDate,
  startDate,
  endDate,
  timeZone,
  sessionCount,
  naturalDays: daily.length,
  totals,
  daily,
  weeks,
  projects
};

if (existsSync(outputRoot) && !existsSync(configFile) && !args.force) {
  const entries = await fs.readdir(outputRoot);
  if (entries.length) throw new Error(`输出目录非空且不是任务观察员报告：${outputRoot}。如确定覆盖，请加 --force`);
}
await fs.mkdir(path.join(outputRoot, 'scripts'), { recursive: true });
if (existsSync(bundledSite)) {
  await fs.cp(bundledSite, outputRoot, { recursive: true, force: true });
  await fs.copyFile(scriptFile, path.join(outputRoot, 'scripts', 'update-review-data.mjs'));
}
await fs.writeFile(path.join(outputRoot, 'generated-data.js'), `window.REVIEW_DATA = ${JSON.stringify(payload, null, 2)};\n`, 'utf8');
await fs.writeFile(configFile, `${JSON.stringify({ startDate, endDate, rollingDefault, timeZone }, null, 2)}\n`, 'utf8');

console.log(`已生成：${outputRoot}`);
console.log(`日期：${startDate}—${endDate}`);
console.log(`统计：${sessionCount} 个主会话，${totals.messages} 条用户消息，${totals.total} total tokens`);

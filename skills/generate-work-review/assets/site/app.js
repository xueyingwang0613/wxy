const data = window.REVIEW_DATA;

if (!data) throw new Error('缺少 generated-data.js，请先运行更新脚本。');

const fmt = number => number >= 1e6 ? `${(number / 1e6).toFixed(2)}M` : number >= 1e3 ? `${(number / 1e3).toFixed(1)}K` : `${number || 0}`;
const fullNumber = number => new Intl.NumberFormat('zh-CN').format(number || 0);
const dateLabel = value => value.replaceAll('-', '.');
const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);
const observerTitle = `${data.codexUserName || '我'}的任务观察员`;
const set = (selector, value) => {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
};

document.title = observerTitle;
set('#observer-brand', observerTitle);
document.querySelector('meta[name="description"]')?.setAttribute('content', `${observerTitle}｜${data.startDate} 至 ${data.endDate}`);

const tabs = [...document.querySelectorAll('.tab')];
const views = [...document.querySelectorAll('[data-view-panel]')];
function showView(name) {
  tabs.forEach(tab => tab.classList.toggle('is-active', tab.dataset.view === name));
  views.forEach(view => view.classList.toggle('is-active', view.dataset.viewPanel === name));
  history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
tabs.forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));

function intensityFor(effective) {
  if (!effective) return { key: 'none', label: '无记录' };
  if (effective < 400000) return { key: 'low', label: '低强度' };
  if (effective < 800000) return { key: 'medium', label: '中强度' };
  if (effective < 1300000) return { key: 'high', label: '高强度' };
  return { key: 'peak', label: '极高强度' };
}

function renderOverview() {
  const range = `${dateLabel(data.startDate)}—${dateLabel(data.endDate)}`;
  const h1 = document.querySelector('#daily .hero-grid h1');
  if (h1) h1.innerHTML = `这段时间，<br><em>全部拉出来算账。</em>`;
  set('#hero-range', `${range}：${data.sessionCount} 个主会话、${data.totals.active} 个活跃日。按本地 transcript 中的真实消息与 token 记录汇总。`);
  set('#overview-total', fmt(data.totals.total));
  set('#overview-effective', fmt(data.totals.effective));
  set('#overview-messages', fullNumber(data.totals.messages));
  set('#overview-sessions', `${data.sessionCount} 个主会话`);
  set('#overview-active', fullNumber(data.totals.active));
  set('#overview-days', `${data.naturalDays} 个自然日内`);
  set('#data-caption-date', dateLabel(data.endDate));
  set('#weekly-period-count', `${data.weeks.length} 个周期，`);
  set('#weekly-cutoff', data.endDate.slice(5).replace('-', '.'));
  set('#project-session-count', fullNumber(data.sessionCount));
  set('#project-total', fmt(data.totals.total));
  set('#footer-source', `DATA SOURCE · ${data.sessionCount} CODEX MAIN SESSIONS / JSONL TOKEN_COUNT`);
  set('#footer-updated', `UPDATED ${dateLabel(data.endDate)} · LOCAL ONLY`);
  const brandRange = document.querySelector('.brand small');
  if (brandRange) brandRange.textContent = `AI WORK REVIEW / ${range}`;
  const projectCount = document.querySelector('.project-summary div:nth-child(2) strong');
  if (projectCount) projectCount.textContent = data.projects.length;
  const note = document.querySelector('.classification-note p');
  if (note) note.textContent = '项目分类由会话关键词自动归类，用于工作复盘，不代表精确工时或财务成本。';
}

const monthNames = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', timeZone: data.timeZone });
const months = [...new Set(data.daily.map(day => day.date.slice(0, 7)))];
let selectedMonth = months.at(-1);

function renderMonthToggle() {
  const root = document.querySelector('.month-toggle');
  root.innerHTML = months.map(month => {
    const label = monthNames.format(new Date(`${month}-02T00:00:00Z`));
    return `<button class="${month === selectedMonth ? 'is-active' : ''}" data-month="${month}">${label}</button>`;
  }).join('');
  root.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    selectedMonth = button.dataset.month;
    renderMonthToggle();
    renderCalendar();
  }));
}

function selectDay(date) {
  const day = data.daily.find(item => item.date === date);
  if (!day) return;
  const intensity = intensityFor(day.effective);
  document.querySelectorAll('.calendar-day').forEach(button => button.classList.toggle('is-active', button.dataset.date === date));
  document.querySelector('#day-detail').innerHTML = `<div class="detail-meta"><p>${day.date}</p><span class="intensity-badge intensity-${intensity.key}">${intensity.label}</span></div><h3>${esc(day.title)}</h3><div class="detail-summary"><small>今日工作总结</small><p class="detail-copy">${esc(day.summary)}</p></div><div class="detail-stats"><span><b>${day.messages}</b><small>用户消息</small></span><span><b>${fmt(day.total)}</b><small>总处理 token</small></span><span><b>${fmt(day.effective)}</b><small>有效新增</small></span></div><div class="detail-verdict">${day.messages ? '有活动记录；具体完成度以文件、发布或验收证据为准。' : '没有数据，不补故事。'}</div><a class="trace-jump" href="#trace-detail">查看完整追溯详情 ↓</a>`;
  const records = day.summary.split(/[；。]/).map(value => value.trim()).filter(Boolean);
  const status = day.total ? '消息与 token 记录完整' : day.messages ? '有消息记录，缺少 token_count' : '未找到可读取的主会话';
  document.querySelector('#trace-detail').innerHTML = `<div class="trace-head"><div><p class="eyebrow">AUDIT TRAIL / 数据追溯</p><h2>${day.date} 详细记录</h2></div><span>DAILY-${day.date.replaceAll('-', '')}</span></div><div class="trace-grid"><section><small>工作记录</small><ol>${records.map(record => `<li>${esc(record)}</li>`).join('') || '<li>当天没有可读取的工作记录。</li>'}</ol></section><section><small>原始统计值</small><dl><div><dt>用户消息</dt><dd>${fullNumber(day.messages)} 条</dd></div><div><dt>总处理 token</dt><dd>${fullNumber(day.total)}</dd></div><div><dt>有效新增</dt><dd>${fullNumber(day.effective)}</dd></div><div><dt>强度分级</dt><dd>${intensity.label}</dd></div></dl></section><section><small>来源与可信度</small><p><b>${status}</b></p><p>来源：Codex 主会话 transcript 中的 user_message 与 token_count 汇总。</p><p>统计时区：${esc(data.timeZone)}。没有记录的字段保持为 0。</p></section></div>`;
}

function renderCalendar() {
  const rows = data.daily.filter(day => day.date.startsWith(selectedMonth));
  const calendar = document.querySelector('#calendar');
  calendar.innerHTML = rows.map(day => `<button class="calendar-day ${day.messages ? 'has-data' : 'is-empty'}" data-date="${day.date}" aria-label="${day.date}，${day.messages} 条消息"><small>${day.date.slice(5)}</small><b>${day.messages || '—'}</b><span>${day.messages ? '条消息' : '无会话'}</span><i style="--level:${Math.min(100, day.effective / 35000)}%" aria-hidden="true"></i></button>`).join('');
  calendar.querySelectorAll('button').forEach(button => button.addEventListener('click', () => selectDay(button.dataset.date)));
  selectDay((rows.find(day => day.messages) || rows[0])?.date);
}

function weekGrade(week) {
  if (!week.messages) return '—';
  if (week.messages >= 40) return '高';
  if (week.messages >= 15) return '中';
  return '低';
}

function renderWeekAnalysis(range) {
  const week = data.weeks.find(item => item.range === range);
  const index = data.weeks.indexOf(week);
  const rows = data.daily.slice(index * 7, index * 7 + 7);
  const active = rows.filter(day => day.messages).sort((a, b) => b.messages - a.messages);
  document.querySelectorAll('.week-card').forEach(card => card.classList.toggle('is-active', card.dataset.week === range));
  set('#weekly-hero-verdict', week.messages ? `${active.length} 个活跃日，投入集中在「${week.focus}」。` : '本周期没有可读取的主会话。');
  set('#weekly-hero-note', '投入数据来自 transcript；成果与闭环需要结合实际文件和发布证据判断。');
  document.querySelector('#weekly-ops').innerHTML = `<div><small>总投入量</small><strong>${fmt(week.total)}</strong><span>${week.messages} 次需求交互</span></div><div><small>活跃天数</small><strong>${active.length}</strong><span>7 天周期</span></div><div class="is-lime"><small>最高频主题</small><strong>${esc(week.focus)}</strong><span>按消息文本归类</span></div><div><small>有效新增</small><strong>${fmt(week.effective)}</strong><span>非缓存输入 + 输出</span></div><div><small>活动强度</small><strong>${weekGrade(week)}</strong><span>只描述投入，不等于产出</span></div><div class="is-risk risk-mid"><small>证据提醒</small><strong>待核验</strong><span>检查文件 / 发布 / 验收</span></div>`;
  document.querySelector('#week-analysis').innerHTML = `<section class="report-verdict"><div><span>W${String(index + 1).padStart(2, '0')} / ${range}</span><h2>${esc(week.focus)}</h2><p>${esc(week.note)}</p></div><b>${weekGrade(week)}</b></section><section class="evidence-section"><div class="report-section-head"><span>ACTIVITY EVIDENCE / 活动证据</span><h2>这一周期留下了什么记录</h2><p>以下是活跃度最高的日期，不把会话投入冒充成果。</p></div><div class="evidence-wall">${active.slice(0, 4).map((day, itemIndex) => `<article class="evidence-${itemIndex + 1}"><small>${day.date}</small><h3>${esc(day.title)}</h3><p>${esc(day.summary)}</p><span class="evidence-status progress">${day.messages} 条消息</span></article>`).join('') || '<article><h3>无活动记录</h3><p>本周期没有可展示的主会话。</p></article>'}</div></section><section class="prescription-section"><div class="prescription-title"><span>REVIEW CHECKLIST / 复盘清单</span><h2>把投入变成可验证结果</h2></div><ol><li><b>01</b><div><small>OUTPUT</small><p>列出本周实际完成的文件、页面、内容或决策。</p></div><span>核验</span></li><li><b>02</b><div><small>CLOSURE</small><p>标记哪些已发布、交付或验收，哪些仍在进行。</p></div><span>核验</span></li><li><b>03</b><div><small>REWORK</small><p>记录一次成本最高的返工及其触发原因。</p></div><span>核验</span></li></ol></section>`;
}

function renderWeeks() {
  document.querySelector('#week-grid').innerHTML = data.weeks.map((week, index) => `<button class="week-card ${index === data.weeks.length - 1 ? 'is-active' : ''}" data-week="${week.range}"><header><small>W${String(index + 1).padStart(2, '0')} · ${week.range}</small><b>${weekGrade(week)}</b></header><h3>${esc(week.focus)}</h3><dl><div><dt>用户消息</dt><dd>${week.messages}</dd></div><div><dt>有效新增</dt><dd>${fmt(week.effective)}</dd></div></dl><footer><span class="closure">自动汇总</span><em>${esc(week.note)}</em></footer></button>`).join('');
  document.querySelectorAll('.week-card').forEach(button => button.addEventListener('click', () => renderWeekAnalysis(button.dataset.week)));
  const max = Math.max(...data.weeks.map(week => week.total), 1);
  document.querySelector('#week-chart').innerHTML = data.weeks.map(week => `<div><span>${week.range}</span><i><b style="width:${week.total / max * 100}%"></b><em style="width:${week.effective / max * 100}%"></em></i><strong>${fmt(week.total)}</strong></div>`).join('');
  renderWeekAnalysis(data.weeks.at(-1).range);
}

function renderProject(id) {
  const project = data.projects.find(item => item.id === id);
  if (!project) return;
  document.querySelectorAll('.project-filter button').forEach(button => button.classList.toggle('is-active', button.dataset.project === id));
  document.querySelector('#project-detail').innerHTML = `<div class="project-head"><div><p>PROJECT ${project.letter}</p><h2>${esc(project.name)}</h2><span class="status amber">${esc(project.status)}</span></div><div class="project-score"><span>主会话</span><strong>${project.sessions}</strong></div><div class="project-score"><span>用户消息</span><strong>${project.messages}</strong></div></div><div class="metrics four"><div class="metric"><small>主会话</small><strong>${project.sessions}</strong><span>关键词自动归类</span></div><div class="metric"><small>用户消息</small><strong>${project.messages}</strong><span>真实 user_message</span></div><div class="metric"><small>总处理 TOKEN</small><strong>${fmt(project.total)}</strong><span>含缓存上下文</span></div><div class="metric accent"><small>有效新增规模</small><strong>${fmt(project.effective)}</strong><span>非缓存输入 + 输出</span></div></div><section class="roi-card"><div><span>活动摘要</span><h3>${esc(project.summary)}</h3></div><p>该分类来自会话关键词，仅用于管理复盘；请结合真实产物与验收证据判断价值。</p></section>`;
}

function renderProjects() {
  const root = document.querySelector('#project-filter');
  if (!data.projects.length) {
    root.innerHTML = '<p>所选日期内没有可分类的会话。</p>';
    document.querySelector('#project-detail').innerHTML = '';
    return;
  }
  root.innerHTML = data.projects.map(project => `<button data-project="${project.id}"><b>${project.letter}</b><span>${esc(project.name)}<small>${project.sessions} 会话 · ${fmt(project.total)}</small></span></button>`).join('');
  root.querySelectorAll('button').forEach(button => button.addEventListener('click', () => renderProject(button.dataset.project)));
  renderProject(data.projects[0].id);
}

renderOverview();
renderMonthToggle();
renderCalendar();
renderWeeks();
renderProjects();
const initialView = location.hash.slice(1);
if (['daily', 'weekly', 'projects'].includes(initialView)) showView(initialView);

const refreshButton = document.querySelector('#refresh-data');
const refreshStatus = document.querySelector('#refresh-status');
refreshButton?.addEventListener('click', async () => {
  refreshButton.disabled = true;
  refreshStatus.textContent = '正在扫描会话…';
  try {
    const response = await fetch('/api/update', { method: 'POST' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '更新失败');
    refreshStatus.textContent = '更新完成，正在刷新…';
    setTimeout(() => location.reload(), 300);
  } catch (error) {
    refreshStatus.textContent = location.protocol === 'file:' ? '请用本地服务打开后更新' : error.message;
    refreshButton.disabled = false;
  }
});

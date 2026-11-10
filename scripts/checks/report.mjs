import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./report.css', import.meta.url), 'utf8');
const labels = { passed: '通过', failed: '失败', skipped: '跳过', cancelled: '已取消', 'not-run': '未执行', interrupted: '已中断', running: '执行中' };
const business = [
  ['account', '账号与权限', 'ACC'], ['news', '新闻阅读', 'NEWS'], ['editor', '个人编辑', 'EDITOR'],
  ['skills', '阅读技能', 'SKILL'], ['topics', '专题与成果', 'TOPIC'], ['runtime', '后台任务与运行', 'OPS'],
  ['reading', '阅读界面', 'UI'], ['engineering', '工程与安全', ''],
];
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const state = value => Object.hasOwn(labels, value) ? value : 'not-run';
const badge = value => `<span class="status ${state(value)}" data-status="${state(value)}">${labels[state(value)]}</span>`;
const milliseconds = value => Number.isFinite(value) ? `${value.toFixed(2)} ms` : '未记录';
const duration = value => !Number.isFinite(value) ? '未记录' : value < 1000 ? `${Math.round(value)} ms` : value < 60000 ? `${(value / 1000).toFixed(1)} 秒` : `${Math.floor(value / 60000)} 分 ${Math.round(value % 60000 / 1000)} 秒`;
const time = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) : '未记录';

function localPath(value) {
  if (typeof value !== 'string' || !value) return null;
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  if (/^[\/\\]|[:\\\x00-\x1f]/.test(decoded) || decoded.split('/').includes('..')) return null;
  return value;
}
function externalUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null; } catch { return null; }
}
function requirements(name) {
  const found = new Set();
  for (const match of String(name).matchAll(/\b(ACC|NEWS|EDITOR|SKILL|TOPIC|OPS|UI|FLOW|STD|SEC|AI)-(\d+(?:\/\d+)*)/g)) {
    for (const number of match[2].split('/')) found.add(`${match[1]}-${number}`);
  }
  return [...found];
}
function category(name) {
  const refs = requirements(name);
  return business.find(([, , prefix]) => prefix && refs.some(ref => ref.startsWith(`${prefix}-`)))?.[0] ?? 'engineering';
}
function attachments(items = []) {
  const valid = items.filter(item => localPath(item.path));
  if (!valid.length) return '';
  return `<div class="attachments">${valid.map(item => {
    const href = escape(localPath(item.path)), name = escape(item.name || item.path);
    return /\.(png|jpe?g|webp|avif)$/i.test(item.path)
      ? `<a class="screenshot" href="${href}" target="_blank" rel="noopener"><img src="${href}" alt="${name}" loading="lazy"><span>${name}</span></a>`
      : `<a class="file-link" href="${href}">${name}</a>`;
  }).join('')}</div>`;
}
function renderCase(item, index) {
  const refs = requirements(item.name);
  const location = [item.file, item.line].filter(value => value !== undefined && value !== '').join(':');
  const search = escape([item.name, item.file, item.project, ...refs].filter(Boolean).join(' ').toLowerCase());
  const failed = item.status === 'failed' || item.status === 'cancelled';
  return `<details class="case" data-case data-category="${category(item.name)}" data-result="${state(item.status)}" data-search="${search}"${item.project ? ` data-project="${escape(item.project)}"` : ''}${failed ? ' open' : ''}>
<summary><span class="case-number">${String(index + 1).padStart(2, '0')}</span><span class="case-title">${escape(item.name)}<span class="case-meta">${escape(item.stageName)}${item.project ? ` · ${escape(item.project)}` : ''}</span></span>${badge(item.status)}<span class="case-duration">${duration(item.durationMs)}</span></summary>
<div class="case-body"><div class="case-reference">${refs.map(ref => `<span class="requirement">${escape(ref)}</span>`).join('')}${location ? `<code>${escape(location)}</code>` : ''}</div>${item.error ? `<pre class="error-detail">${escape(item.error)}</pre>` : '<p class="case-note">检查结果来自本轮测试执行。</p>'}${attachments(item.attachments)}</div></details>`;
}
function renderStage(stage, index) {
  const log = localPath(stage.log);
  return `<li class="stage" data-stage="${escape(stage.id)}"><details${stage.status === 'failed' || stage.status === 'interrupted' ? ' open' : ''}>
<summary><span class="stage-number">${String(index + 1).padStart(2, '0')}</span><span class="stage-name">${escape(stage.name)}</span>${badge(stage.status)}<span class="stage-duration">${duration(stage.durationMs)}</span></summary>
<div class="stage-body">${stage.command ? `<code class="command">${escape(stage.command)}</code>` : ''}${stage.error ? `<pre class="error-detail">${escape(stage.error)}</pre>` : ''}<div class="stage-links">${Number.isInteger(stage.exitCode) ? `<span>退出码 ${stage.exitCode}</span>` : ''}${log ? `<a href="${escape(log)}">查看阶段日志</a>` : ''}</div></div></details></li>`;
}
function renderAsync(data) {
  if (!data || !data.latency && !data.recovery && !data.ackRecovery) return '';
  const measurements = data.latency?.measurements ?? [];
  const observations = [];
  if (data.recovery) {
    const value = data.recovery;
    if (Number.isFinite(value.duplicateRequests) && Number.isFinite(value.distinctTasks)) observations.push(`并发提交 ${value.duplicateRequests} 次，建立 ${value.distinctTasks} 个任务。`);
    if (Number.isFinite(value.newsRecords)) observations.push(`业务新闻保留 ${value.newsRecords} 条。`);
    if (Number.isFinite(value.receiveRollbackHttp)) observations.push(`接收事务回滚返回 HTTP ${value.receiveRollbackHttp}，孤儿任务 ${value.orphanTasks} 个。`);
  }
  if (data.ackRecovery) {
    const value = data.ackRecovery;
    observations.push(`确认前中断：${value.signal}；恢复后任务 ${value.taskStatus}，队列 ${value.queueStatus}。`);
  }
  return `<section id="async-results" class="panel"><div class="section-heading"><div><p class="eyebrow">任务执行</p><h2>异步检查</h2></div><span class="quiet">本轮接口测试记录</span></div>${measurements.length ? `<div class="table-scroll"><table><caption class="sr-only">提交响应与完整处理耗时</caption><thead><tr><th>上游等待</th><th>提交 P95</th><th>完整处理</th><th>样本数</th></tr></thead><tbody>${measurements.map(row => `<tr><td>${milliseconds(row.upstreamDelayMs)}</td><td>${milliseconds(row.p95Ms)}</td><td>${milliseconds(row.processingMs)}</td><td>${Array.isArray(row.samplesMs) ? row.samplesMs.length : '未记录'}</td></tr>`).join('')}</tbody></table></div>` : ''}${observations.length ? `<ul class="observations">${observations.map(value => `<li>${escape(value)}</li>`).join('')}</ul>` : ''}</section>`;
}

export function renderReport(report) {
  const stages = report.stages ?? [];
  const cases = stages.flatMap(stage => (stage.tests ?? []).map(item => ({ ...item, stageName: stage.name })));
  const count = name => cases.filter(item => item.status === name).length;
  const groups = business.map(([id, title]) => ({ id, title, items: cases.filter(item => category(item.name) === id) })).filter(group => group.items.length);
  const overall = report.status === 'passed' ? '本轮检查通过' : report.status === 'interrupted' ? '本轮检查已中断' : '本轮检查未通过';
  const elapsed = report.finishedAt && report.startedAt ? Date.parse(report.finishedAt) - Date.parse(report.startedAt) : undefined;
  const issueLink = localPath(report.issuesUrl) ?? externalUrl(report.issuesUrl);
  const asyncSection = renderAsync(report.async);
  const source = report.source ?? {}, environment = report.environment ?? {};
  const stagePassed = stages.filter(stage => stage.status === 'passed').length;
  const stageRemaining = stages.filter(stage => stage.status === 'not-run').length;
  const sourceState = source.dirty === true ? '工作区含未提交修改' : source.dirty === false ? '工作区干净' : '工作区状态未记录';
  let caseIndex = 0;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>NewsClaw · 验收报告</title><style>${css}</style></head>
<body><main class="report"><header class="masthead"><a class="brand" href="#overview"><span class="brand-mark" aria-hidden="true">N</span>NewsClaw<span class="brand-caption">验收报告</span></a><span class="run-date">${time(report.startedAt)} · 上海时间</span></header>
<section id="overview" class="overview"><div class="overview-heading"><div><p class="eyebrow">自动检查</p><h1>${overall}</h1><p class="summary-text">${stagePassed} / ${stages.length} 个阶段通过${stageRemaining ? `，${stageRemaining} 个阶段未执行` : ''}。本轮取得 ${cases.length} 条用例执行记录。</p></div>${badge(report.status)}</div>
${report.failure ? `<div class="run-error"><strong>本轮未完成原因</strong><pre>${escape(report.failure)}</pre></div>` : ''}
<div class="metrics"><div><span>通过</span><strong data-metric="passed-tests">${count('passed')}</strong></div><div><span>失败</span><strong data-metric="failed-tests">${count('failed')}</strong></div><div><span>跳过 / 取消</span><strong>${count('skipped')}<small> / ${count('cancelled')}</small></strong></div><div><span>总耗时</span><strong class="elapsed">${duration(elapsed)}</strong></div></div>
<dl class="run-meta"><div><dt>提交</dt><dd><code>${escape(source.commit || '未记录')}</code></dd></div><div><dt>分支</dt><dd>${escape(source.branch || '未记录')}</dd></div><div><dt>工作区</dt><dd>${sourceState}</dd></div><div><dt>环境</dt><dd>${escape([environment.platform, environment.arch, environment.node ? `Node ${environment.node}` : ''].filter(Boolean).join(' · ') || '未记录')}</dd></div><div><dt>结束时间</dt><dd>${time(report.finishedAt)}</dd></div></dl>
<p class="scope-note">结果对应本轮执行的检查，外部信源与模型使用测试替身。不同视口分别计入用例执行记录。${issueLink ? ` <a href="${escape(issueLink)}" target="_blank" rel="noopener">查看既有审查记录</a>` : ''}</p>${report.reviewSummary ? `<p class="scope-note review-summary"><strong>已登记问题：</strong>${escape(report.reviewSummary)}</p>` : ''}</section>
<nav class="section-nav" aria-label="报告章节"><a href="#stages">执行阶段</a><a href="#cases">业务用例</a>${asyncSection ? '<a href="#async-results">异步检查</a>' : ''}<a href="#artifacts">运行材料</a></nav>
<section id="stages" class="panel"><div class="section-heading"><div><p class="eyebrow">执行过程</p><h2>检查阶段</h2></div><span class="quiet">展开查看命令与日志</span></div>${stages.length ? `<ol class="stages">${stages.map(renderStage).join('')}</ol>` : '<p class="empty-note">检查阶段尚未开始。</p>'}</section>
<section id="cases" class="panel"><div class="section-heading"><div><p class="eyebrow">需求与行为</p><h2>业务用例</h2></div><span class="quiet" id="case-count">${cases.length} 条执行记录</span></div>
${cases.length ? `<form class="filters" role="search" onsubmit="return false"><div class="search-field"><label for="case-search">查找用例</label><input id="case-search" type="search" placeholder="需求编号、名称或文件" autocomplete="off"></div><div><label for="case-business">能力</label><select id="case-business"><option value="all">全部能力</option>${groups.map(group => `<option value="${group.id}">${group.title}</option>`).join('')}</select></div><div><label for="case-status">结果</label><select id="case-status"><option value="all">全部结果</option><option value="failed">失败</option><option value="passed">通过</option><option value="skipped">跳过</option><option value="cancelled">已取消</option></select></div><button id="reset-filters" type="button">清除筛选</button></form>
${groups.map(group => `<section class="business-group" data-business="${group.id}"><div class="group-heading"><h3>${group.title}</h3><span class="group-count">${group.items.length} 条</span></div>${group.items.sort((a, b) => Number(b.status === 'failed') - Number(a.status === 'failed')).map(item => renderCase(item, caseIndex++)).join('')}</section>`).join('')}<p id="no-matches" class="empty-note" hidden>没有符合筛选条件的用例。</p>` : '<p class="empty-note">本轮尚未取得用例结果。请查看执行阶段和运行日志。</p>'}</section>
${asyncSection}
<section id="artifacts" class="panel"><div class="section-heading"><div><p class="eyebrow">本轮产物</p><h2>运行材料</h2></div></div>${attachments(report.artifacts)}<p class="scope-note">完整日志、截图和生成报告保存在本地运行目录。浏览器详细报告可使用 Playwright 的 show-report 命令查看。</p></section>
<footer><span>NewsClaw · 账号、新闻、个人编辑与阅读成果</span><a href="#overview">回到概况</a></footer></main>
<script>${filterScript}</script></body></html>`;
}

const filterScript = `(() => {
  const search = document.querySelector('#case-search');
  if (!search) return;
  const business = document.querySelector('#case-business');
  const status = document.querySelector('#case-status');
  const rows = [...document.querySelectorAll('[data-case]')];
  const groups = [...document.querySelectorAll('[data-business]')];
  function update() {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of rows) {
      row.hidden = !(row.dataset.search.includes(query) && (business.value === 'all' || row.dataset.category === business.value) && (status.value === 'all' || row.dataset.result === status.value));
      if (!row.hidden) visible++;
    }
    for (const group of groups) {
      const count = [...group.querySelectorAll('[data-case]')].filter(row => !row.hidden).length;
      group.hidden = count === 0;
      group.querySelector('.group-count').textContent = count + ' 条';
    }
    document.querySelector('#case-count').textContent = '显示 ' + visible + ' / ' + rows.length + ' 条';
    document.querySelector('#no-matches').hidden = visible !== 0;
  }
  search.addEventListener('input', update);
  business.addEventListener('change', update);
  status.addEventListener('change', update);
  document.querySelector('#reset-filters').addEventListener('click', () => {
    search.value = ''; business.value = 'all'; status.value = 'all'; update(); search.focus();
  });
})();`;

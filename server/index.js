import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { AcpSession } from './acp-session.js';
import { loadAllQuestions, listYears } from './zhenti-parser.js';
import { getLlmConfig } from './llm.js';
import { createAgent } from './agent.js';
import { rebuildPlanSnapshot, readPlan, writePlan, todayShanghai as planToday } from './review-plan.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const server = createServer(app);
const accessToken = 'thinkmoon';
const agent = createAgent({ root });
const tokenMatches = candidate => {
  if (!candidate) return false;
  const actual = Buffer.from(candidate); const expected = Buffer.from(accessToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const wss = new WebSocketServer({
  server,
  path: '/ws/acp',
  maxPayload: 12 * 1024 * 1024,
  verifyClient: ({ req }) => tokenMatches(new URL(req.url, 'http://localhost').searchParams.get('token')),
});

// ---------- 状态文件 API ----------

// REST API 鉴权：与 WebSocket 共用同一 token。
// 浏览器端会从 URL ?token= 存到 localStorage 并改用 header，避免 token 长期留在地址栏。
const apiAuth = (req, res, next) => {
  const header = req.headers['x-api-token'];
  const query = req.query.token;
  if (tokenMatches(header) || tokenMatches(typeof query === 'string' ? query : null)) return next();
  res.status(401).json({ error: '未授权访问' });
};

const stateDir = path.join(root, 'state');
const progressFile = path.join(stateDir, 'progress.json');
const attemptsFile = path.join(stateDir, 'attempts.json');
const mistakesFile = path.join(stateDir, 'mistakes.json');
const studySessionsFile = path.join(stateDir, 'study-sessions.json');
const reviewPlanFile = path.join(stateDir, 'review-plan.json');

function sessionMinutes(item) {
  if (Number.isFinite(Number(item.activeSeconds))) return Math.floor(Number(item.activeSeconds) / 60);
  return Number(item.minutes || 0);
}

async function syncReviewPlan() {
  const [plan, attempts, mistakes, sessions] = await Promise.all([
    readPlan(reviewPlanFile),
    readJson(attemptsFile, { items: [] }),
    readJson(mistakesFile, { items: [] }),
    readJson(studySessionsFile, { items: [] }),
  ]);
  if (!plan) return null;
  const completedSessions = (sessions.items || []).filter(item => item.status === 'completed');
  const studyMinutes = completedSessions.reduce((sum, item) => sum + sessionMinutes(item), 0);
  const studyMinutesToday = completedSessions
    .filter(item => toShanghaiDate(new Date(item.stoppedAt || item.startedAt)) === planToday())
    .reduce((sum, item) => sum + sessionMinutes(item), 0);
  const snapshot = rebuildPlanSnapshot(plan, attempts.items || [], mistakes.items || [], planToday(), { studyMinutes, studyMinutesToday });
  await writePlan(reviewPlanFile, snapshot);
  return snapshot;
}

// 同一文件串行写，避免并发交错（简单 promise 队列）
const writeQueues = new Map();
function enqueue(key, task) {
  const prev = writeQueues.get(key) || Promise.resolve();
  const run = prev.then(task, task);
  writeQueues.set(key, run.then(() => {}, () => {}));
  return run;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf-8')); } catch { return fallback; }
}

function toShanghaiDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}
const todayShanghai = () => toShanghaiDate(new Date());

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

app.use(express.json({ limit: '10mb' }));

// 0. 可用年份列表
app.get('/api/years', apiAuth, (_req, res) => res.json({ years: listYears() }));

// 1. 真题列表（综合知识单选题）
app.get('/api/questions', apiAuth, (req, res) => {
  const year = String(req.query.year || '2024下');  const all = loadAllQuestions().filter(q => q.year === year && q.subject === '综合知识');
  const ids = req.query.ids ? String(req.query.ids).split(',').map(s => s.trim()).filter(Boolean) : null;
  if (ids) {
    const idSet = new Set(ids);
    const questions = all.filter(q => idSet.has(q.id));
    return res.json({ year, total: questions.length, page: 1, pageSize: questions.length, questions });
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.max(1, parseInt(req.query.pageSize, 10) || 20);
  const start = (page - 1) * pageSize;
  res.json({ year, total: all.length, page, pageSize, questions: all.slice(start, start + pageSize) });
});

// 2. 复习计划（JSON 为唯一权威，运行时重算今日快照）
app.get('/api/review-plan', apiAuth, async (_req, res) => {
  try {
    const plan = await syncReviewPlan();
    if (!plan) return res.status(404).json({ error: '复习计划不存在' });
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.patch('/api/review-plan/tasks/:taskId', apiAuth, async (_req, res) => {
  // 完成状态是答题、复习和计时证据的派生结果，禁止客户端直接改写。
  const plan = await syncReviewPlan();
  if (!plan) return res.status(404).json({ error: '复习计划不存在' });
  const exists = Object.values(plan.dailyPlans || {}).some(day => day.tasks?.some(item => item.id === _req.params.taskId));
  if (!exists) return res.status(404).json({ error: '任务不存在' });
  return res.status(409).json({ error: '任务完成状态由学习记录自动判定，不能手动修改', plan });
});

// 刷题活跃计时：前端只上报活跃增量，服务端幂等累计；前端每 30 秒节流写入。
app.post('/api/study-activity', apiAuth, async (req, res) => {
  const { clientId, seconds, occurredAt } = req.body || {};
  const delta = Math.floor(Number(seconds));
  if (!clientId || !Number.isFinite(delta) || delta < 1 || delta > 120) return res.status(400).json({ error: 'clientId 与 1-120 秒活跃增量为必填项' });
  const at = typeof occurredAt === 'string' && Number.isFinite(new Date(occurredAt).getTime()) ? new Date(occurredAt) : new Date();
  const date = toShanghaiDate(at);
  const sessionId = `practice-${date}`;
  const item = await enqueue(studySessionsFile, async () => {
    const data = await readJson(studySessionsFile, { schema_version: 1, items: [] });
    let entry = data.items.find(row => row.id === sessionId);
    if (!entry) {
      entry = { id: sessionId, type: 'practice-activity', startedAt: at.toISOString(), stoppedAt: at.toISOString(), status: 'completed', activeSeconds: 0, clientFlushes: [] };
      data.items.push(entry);
    }
    entry.clientFlushes ||= [];
    if (!entry.clientFlushes.includes(clientId)) {
      entry.activeSeconds = Number(entry.activeSeconds || 0) + delta;
      entry.minutes = Math.floor(entry.activeSeconds / 60);
      entry.stoppedAt = at.toISOString();
      entry.clientFlushes.push(clientId);
      if (entry.clientFlushes.length > 500) entry.clientFlushes = entry.clientFlushes.slice(-500);
      await writeFile(studySessionsFile, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    }
    return entry;
  });
  await syncReviewPlan();
  res.json({ ok: true, activeSeconds: item.activeSeconds, minutes: sessionMinutes(item) });
});

// 兼容旧版手动计时接口；新前端不再展示手动按钮。
app.get('/api/study-sessions/active', apiAuth, async (_req, res) => {
  const data = await readJson(studySessionsFile, { items: [] });
  res.json({ session: [...(data.items || [])].reverse().find(item => item.status === 'active') || null });
});

app.post('/api/study-sessions/start', apiAuth, async (_req, res) => {
  const existing = await readJson(studySessionsFile, { items: [] });
  const active = [...(existing.items || [])].reverse().find(item => item.status === 'active');
  if (active) return res.json({ session: active });
  const item = { id: randomUUID(), startedAt: new Date().toISOString(), status: 'active' };
  await enqueue(studySessionsFile, async () => {
    const data = await readJson(studySessionsFile, { schema_version: 1, items: [] });
    data.items.push(item);
    await writeFile(studySessionsFile, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  });
  res.status(201).json({ session: item });
});

app.post('/api/study-sessions/:id/stop', apiAuth, async (req, res) => {
  const result = await enqueue(studySessionsFile, async () => {
    const data = await readJson(studySessionsFile, { schema_version: 1, items: [] });
    const item = data.items.find(entry => entry.id === req.params.id);
    if (!item || item.status !== 'active') return null;
    const stoppedAt = new Date();
    item.stoppedAt = stoppedAt.toISOString();
    item.minutes = Math.max(1, Math.floor((stoppedAt - new Date(item.startedAt)) / 60000));
    item.status = 'completed';
    await writeFile(studySessionsFile, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    return item;
  });
  if (!result) return res.status(404).json({ error: '没有可结束的学习会话' });
  await enqueue(progressFile, async () => {
    const progress = await readJson(progressFile, null);
    if (!progress) return;
    const sessions = await readJson(studySessionsFile, { items: [] });
    const completed = sessions.items.filter(item => item.status === 'completed');
    progress.total_study_minutes = completed.reduce((sum, item) => sum + sessionMinutes(item), 0);
    progress.completed_sessions = completed.length;
    progress.last_study_date = todayShanghai();
    await writeFile(progressFile, JSON.stringify(progress, null, 2) + '\n', 'utf-8');
  });
  await syncReviewPlan();
  res.json({ session: result });
});

// 3. 后端状态汇总
app.get('/api/state', apiAuth, async (_req, res) => {
  const [progress, mistakes, attempts] = await Promise.all([
    readJson(progressFile, null),
    readJson(mistakesFile, null),
    readJson(attemptsFile, null),
  ]);
  res.json({ progress, mistakes, attempts });
});

// 3. 记录一次答题
app.post('/api/attempts', apiAuth, async (req, res) => {
  const body = req.body || {};
  const { questionId, year, source, selected, correct, topic, explanation } = body;
  if (!questionId || typeof selected !== 'number') {
    return res.status(400).json({ error: 'questionId 与 selected 为必填项' });
  }
  const answeredAt = typeof body.answeredAt === 'string' && body.answeredAt
    ? body.answeredAt : new Date().toISOString();
  const item = {
    id: randomUUID(),
    questionId, year: year || '', source: source || '',
    selected, correct: !!correct, topic: topic || '', explanation: explanation || '', answeredAt,
  };

  try {
    await enqueue(attemptsFile, async () => {
      const attempts = await readJson(attemptsFile, { schema_version: 1, items: [] });
      attempts.items.push(item);
      await writeFile(attemptsFile, JSON.stringify(attempts, null, 2) + '\n', 'utf-8');
    });

    if (!item.correct) {
      await enqueue(mistakesFile, async () => {
        const data = await readJson(mistakesFile, { schema_version: 1, items: [] });
        if (!data.items.some(entry => entry.questionId === item.questionId)) data.items.push({ questionId: item.questionId, addedAt: todayShanghai() });
        await writeFile(mistakesFile, JSON.stringify(data, null, 2) + '\n', 'utf-8');
      });
    }

    await enqueue(progressFile, async () => {
      const progress = await readJson(progressFile, null);
      if (!progress) return;
      progress.attempted_questions = (progress.attempted_questions || 0) + 1;
      progress.last_study_date = todayShanghai();
      // 会话窗口：每次 POST 后重算最近 20 题正确率并追加
      const attempts = await readJson(attemptsFile, { schema_version: 1, items: [] });
      const last20 = attempts.items.slice(-20);
      const acc = last20.filter(a => a.correct).length / Math.max(1, last20.length);
      if (!progress.scores) progress.scores = { comprehensive: [], case_analysis: [], essay: [] };
      progress.scores.comprehensive.push(Math.round(acc * 10000) / 10000);
      await writeFile(progressFile, JSON.stringify(progress, null, 2) + '\n', 'utf-8');
    });
    await syncReviewPlan();
    res.status(201).json({ ok: true, id: item.id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// 回写已保存答题记录的 AI 解析，不影响原始答题记录
app.patch('/api/attempts/:id/explanation', apiAuth, async (req, res) => {
  const { explanation } = req.body || {};
  if (typeof explanation !== 'string' || !explanation.trim()) return res.status(400).json({ error: 'explanation 为必填项' });
  try {
    const updated = await enqueue(attemptsFile, async () => {
      const attempts = await readJson(attemptsFile, { schema_version: 1, items: [] });
      const item = attempts.items.find(entry => entry.id === req.params.id);
      if (!item) return false;
      item.explanation = explanation;
      item.explanationUpdatedAt = new Date().toISOString();
      await writeFile(attemptsFile, JSON.stringify(attempts, null, 2) + '\n', 'utf-8');
      return true;
    });
    if (!updated) return res.status(404).json({ error: '答题记录不存在' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// 4. 错题增删
app.post('/api/mistakes', apiAuth, async (req, res) => {
  const { questionId, action } = req.body || {};
  if (!questionId || !['add', 'remove'].includes(action)) {
    return res.status(400).json({ error: 'questionId 与 action(add|remove) 为必填项' });
  }
  try {
    const mistakes = await enqueue(mistakesFile, async () => {
      const data = await readJson(mistakesFile, { schema_version: 1, items: [] });
      if (action === 'add') {
        if (!data.items.some(m => m.questionId === questionId)) {
          data.items.push({ questionId, addedAt: todayShanghai() });
        }
      } else {
        data.items = data.items.filter(m => m.questionId !== questionId);
      }
      await writeFile(mistakesFile, JSON.stringify(data, null, 2) + '\n', 'utf-8');
      return data;
    });
    await syncReviewPlan();
    res.json({ ok: true, count: mistakes.items.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

function clipText(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function buildExplainPrompt({ question, options, answer, source, topic }) {
  const opts = (options || []).map((o, i) => `${String.fromCharCode(65 + i)}. ${clipText(o, 80)}`).join('\n');
  return `你是软考高级系统架构设计师辅导老师。请解析下面这道综合知识真题，直接给出适合移动端阅读的中文 Markdown：\n\n来源：${source || '历年真题'}\n知识点：${topic || '未分类'}\n题目：${clipText(question, 1600)}\n选项：\n${opts}\n正确答案：${String.fromCharCode(65 + answer)}\n\n要求：先说明答案，再解释核心考点；逐项说明其他选项为什么不对；最后给出一句记忆要点。标题、段落、列表之间必须换行。不要重复题目，不要编造标准或出处。`;
}

// 流式生成解析，前端按 token 增量渲染
app.post('/api/explain/stream', apiAuth, async (req, res) => {
  const { question, options, answer, source, topic } = req.body || {};
  if (!question || !Array.isArray(options) || typeof answer !== 'number') return res.status(400).json({ error: '题目、选项和答案为必填项' });
  try {
    const { baseURL, apiKey, model, maxOutputTokens } = await getLlmConfig();
    const upstream = await fetch(`${baseURL}/chat/completions`, { method:'POST', headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' }, body:JSON.stringify({ model, messages:[{role:'user',content:buildExplainPrompt(req.body)}], temperature:0.2, max_tokens:maxOutputTokens, stream:true }) });
    if (!upstream.ok) throw new Error((await upstream.text()) || `LLM 请求失败（${upstream.status}）`);
    res.status(200).set({ 'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-cache, no-transform', Connection:'keep-alive', 'X-Accel-Buffering':'no' });
    const reader=upstream.body.getReader(); const decoder=new TextDecoder(); let buffer='';
    const send=(event,payload)=>res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    while(true){
      const {value,done}=await reader.read(); if(done) break; buffer+=decoder.decode(value,{stream:true});
      const lines=buffer.split(/\r?\n/); buffer=lines.pop() || '';
      for(const line of lines){ if(!line.startsWith('data:')) continue; const raw=line.slice(5).trim(); if(raw==='[DONE]') continue; try { const data=JSON.parse(raw); const text=data.choices?.[0]?.delta?.content || ''; if(text) send('token',{text}); } catch {} }
    }
    send('done',{model}); res.end();
  } catch(error) { console.error('[explain/stream]',error); if(!res.headersSent) res.status(502).json({error:error instanceof Error?error.message:String(error)}); else { res.write(`event: error\ndata: ${JSON.stringify({error:error.message})}\n\n`); res.end(); } }
});

// 5. 使用 ooencode 配置的 qwen3.6-27b 生成题目解析
app.post('/api/explain', apiAuth, async (req, res) => {
  const { question, options, answer, source, topic } = req.body || {};
  if (!question || !Array.isArray(options) || typeof answer !== 'number') {
    return res.status(400).json({ error: '题目、选项和答案为必填项' });
  }
  try {
    const { baseURL, apiKey, model, maxOutputTokens } = await getLlmConfig();
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: buildExplainPrompt(req.body) }], temperature: 0.2, max_tokens: maxOutputTokens }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `LLM 请求失败（${response.status}）`);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM 未返回解析内容');
    res.json({ content, model });
  } catch (error) {
    console.error('[explain]', error);
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/chat/stream', apiAuth, async (req, res) => {
  const raw = Array.isArray(req.body?.messages) ? req.body.messages.slice(-8) : [];
  const history = raw.map((m, i) => {
    const item = { role: m.role, text: String(m.text || '').slice(0, 1200) };
    if (i === raw.length - 1 && typeof m.image === 'string' && m.image.startsWith('data:image/') && m.image.length < 6_000_000) {
      item.image = m.image;
    }
    return item;
  });
  if (!history.length) return res.status(400).json({ error: 'messages 不能为空' });
  try {
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Content-Encoding': 'identity' });
    res.flushHeaders();
    // 先发 ready 事件，立即打通浏览器、反代与服务端之间的流式链路。
    res.write(`event: ready\ndata: {}\n\n`);
    const send = (event, payload) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); };
    const ac = new AbortController();
    // IncomingMessage.close 在请求体接收完毕后也可能触发，不能把它当成客户端取消；
    // 否则图片请求刚到服务端就会被 Abort，SSE 只返回空响应。
    req.on('aborted', () => ac.abort());
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    await agent.run({ history, signal: ac.signal, onEvent: send });
    send('done', { model: (await getLlmConfig()).model });
    res.end();
  } catch (error) {
    if (error?.name === 'AbortError') { if (!res.writableEnded) res.end(); return; }
    console.error('[chat/stream]', error);
    const message = error instanceof Error ? error.message : String(error);
    if (!res.headersSent) res.status(502).json({ error: message });
    else { res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`); res.end(); }
  }
});

// 6. 首页统计（全部由后端 JSON 计算）
app.get('/api/stats', apiAuth, async (_req, res) => {
  const [mistakes, attempts, sessions, plan] = await Promise.all([
    readJson(mistakesFile, { items: [] }),
    readJson(attemptsFile, { items: [] }),
    readJson(studySessionsFile, { items: [] }),
    syncReviewPlan(),
  ]);
  const items = attempts.items || [];
  const last20 = items.slice(-20);
  const recentAccuracy = last20.length ? last20.filter(a => a.correct).length / last20.length : 0;

  // 连续学习天数（从最近一次答题日向前连续计数）
  const dates = new Set(items.map(a => toShanghaiDate(new Date(a.answeredAt))));
  let studyDays = 0, cursor = todayShanghai();
  if (!dates.has(cursor)) cursor = addDays(cursor, -1);
  while (dates.has(cursor)) { studyDays++; cursor = addDays(cursor, -1); }

  // 最近 7 天按天聚合正确率
  const dayAgg = new Map();
  for (const a of items) {
    const d = toShanghaiDate(new Date(a.answeredAt));
    const e = dayAgg.get(d) || { total: 0, correct: 0 };
    e.total++; if (a.correct) e.correct++;
    dayAgg.set(d, e);
  }
  const today = todayShanghai();
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const key = addDays(today, -i);
    const e = dayAgg.get(key);
    if (!e) continue;
    trend.push({ d: key === today ? '今天' : `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`, v: Math.round(e.correct / e.total * 100) });
  }

  // 按知识点掌握度
  const topicAgg = new Map();
  for (const a of items) {
    const t = a.topic || '未分类';
    const e = topicAgg.get(t) || { total: 0, correct: 0 };
    e.total++; if (a.correct) e.correct++;
    topicAgg.set(t, e);
  }
  const masteryByTopic = [...topicAgg.entries()]
    .map(([subject, e]) => ({ subject, value: Math.round(e.correct / e.total * 100) }))
    .sort((a, b) => b.value - a.value);

  const dailyActivity = new Map();
  for (const attempt of items) {
    const d = toShanghaiDate(new Date(attempt.answeredAt));
    const row = dailyActivity.get(d) || { date: d, questions: 0, minutes: 0 };
    row.questions++;
    dailyActivity.set(d, row);
  }
  for (const session of sessions.items || []) {
    const d = toShanghaiDate(new Date(session.stoppedAt || session.startedAt));
    const row = dailyActivity.get(d) || { date: d, questions: 0, minutes: 0 };
    row.minutes += sessionMinutes(session);
    dailyActivity.set(d, row);
  }

  res.json({
    totalDone: items.length,
    mistakeCount: (mistakes.items || []).length,
    recentAccuracy,
    studyDays,
    trend,
    masteryByTopic,
    calendar: [...dailyActivity.values()].sort((a, b) => a.date.localeCompare(b.date)),
    studyMinutes: (sessions.items || []).reduce((sum, item) => sum + sessionMinutes(item), 0),
    attempts: items, // 供前端判断错题「待复习/已掌握」
    today: plan?.stats?.today || { date: today, attemptedQuestions: 0, correctQuestions: 0, dueReviews: 0, studyMinutes: 0, plannedMinutes: 0 },
    reviewPlan: plan ? {
      phase: plan.phases.find(item => today >= item.startDate && today <= item.endDate) || null,
      todayPlan: plan.dailyPlans?.[today] || null,
      dueReviews: (plan.mistakeQueue || []).filter(item => item.nextReviewAt <= today && item.status !== 'mastered').slice(0, plan.reviewPolicy?.maxDueItemsPerDay || 10),
    } : null,
  });
});

if (process.env.NODE_ENV === 'development') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ root, server: { middlewareMode: true, allowedHost: true }, appType: 'spa' });

  // Rewrite non-localhost Host headers before Vite middleware
  // (Cloudflare Tunnel sends the real hostname; Vite blocks it by default)
  app.use((req, res, next) => {
    const host = req.headers.host;
    if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
      req.headers.host = 'localhost';
    }
    next();
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, 'dist')));
  app.get('*splat', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}

// ---------- WebSocket / ACP ----------

wss.on('connection', socket => {
  const send = payload => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };
  const acpSession = new AcpSession({ cwd: root, emit: send });
  send({ type: 'status', status: 'connecting', detail: '正在连接 Claude Code…' });
  socket.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'prompt') void acpSession.prompt({ text: message.text, image: message.image });
      else if (message.type === 'permission_response') acpSession.resolvePermission(message.requestId, message.optionId);
      else if (message.type === 'cancel') void acpSession.cancel();
    } catch (error) {
      send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  });
  socket.on('close', () => acpSession.close());
});

// 默认端口 5174：与 Cloudflare Tunnel 的 ruankao.thinkmoon.cn 映射保持一致，
// 5173 已被 investment-research-agent（supervisor 托管）长期占用，不要改回 5173
const port = Number(process.env.PORT || 5174);
const host = process.env.HOST || '0.0.0.0';
server.listen(port, host, () => {
  console.log(`软考助手已启动：http://localhost:${port}/?token=${accessToken}`);
  console.log('访问令牌仅用于本次启动，请勿把链接转发给他人。');
});

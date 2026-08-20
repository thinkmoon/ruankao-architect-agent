import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { AcpSession } from './acp-session.js';
import { loadAllQuestions, listYears } from './zhenti-parser.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const server = createServer(app);
const accessToken = 'thinkmoon';
const llmConfigPath = '/home/liqinsi/storage/config/opencode/opencode.json';
let llmConfigPromise;
async function getLlmConfig() {
  if (!llmConfigPromise) llmConfigPromise = readFile(llmConfigPath, 'utf-8').then(JSON.parse);
  const config = await llmConfigPromise;
  const provider = config.provider?.sribd;
  if (!provider?.options?.baseURL || !provider?.options?.apiKey) throw new Error('未找到 ooencode 的 sribd LLM 配置');
  return { baseURL: provider.options.baseURL.replace(/\/$/, ''), apiKey: provider.options.apiKey };
}
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

app.use(express.json());

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

// 2. 后端状态汇总
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
    res.json({ ok: true, count: mistakes.items.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

function buildExplainPrompt({ question, options, answer, source, topic }) {
  return `你是软考高级系统架构设计师辅导老师。请解析下面这道综合知识真题，直接给出适合移动端阅读的中文 Markdown：\n\n来源：${source || '历年真题'}\n知识点：${topic || '未分类'}\n题目：${question}\n选项：\n${options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}\n正确答案：${String.fromCharCode(65 + answer)}\n\n要求：先说明答案，再解释核心考点；逐项说明其他选项为什么不对；最后给出一句记忆要点。标题、段落、列表之间必须换行。不要重复题目，不要编造标准或出处。`;
}

// 流式生成解析，前端按 token 增量渲染
app.post('/api/explain/stream', apiAuth, async (req, res) => {
  const { question, options, answer, source, topic } = req.body || {};
  if (!question || !Array.isArray(options) || typeof answer !== 'number') return res.status(400).json({ error: '题目、选项和答案为必填项' });
  try {
    const { baseURL, apiKey } = await getLlmConfig();
    const upstream = await fetch(`${baseURL}/chat/completions`, { method:'POST', headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' }, body:JSON.stringify({ model:'qwen3.6-27b', messages:[{role:'user',content:buildExplainPrompt(req.body)}], temperature:0.2, max_tokens:1200, stream:true }) });
    if (!upstream.ok) throw new Error((await upstream.text()) || `LLM 请求失败（${upstream.status}）`);
    res.status(200).set({ 'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-cache, no-transform', Connection:'keep-alive', 'X-Accel-Buffering':'no' });
    const reader=upstream.body.getReader(); const decoder=new TextDecoder(); let buffer='';
    const send=(event,payload)=>res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    while(true){
      const {value,done}=await reader.read(); if(done) break; buffer+=decoder.decode(value,{stream:true});
      const lines=buffer.split(/\r?\n/); buffer=lines.pop() || '';
      for(const line of lines){ if(!line.startsWith('data:')) continue; const raw=line.slice(5).trim(); if(raw==='[DONE]') continue; try { const data=JSON.parse(raw); const text=data.choices?.[0]?.delta?.content || ''; if(text) send('token',{text}); } catch {} }
    }
    send('done',{model:'qwen3.6-27b'}); res.end();
  } catch(error) { console.error('[explain/stream]',error); if(!res.headersSent) res.status(502).json({error:error instanceof Error?error.message:String(error)}); else { res.write(`event: error\ndata: ${JSON.stringify({error:error.message})}\n\n`); res.end(); } }
});

// 5. 使用 ooencode 配置的 qwen3.6-27b 生成题目解析
app.post('/api/explain', apiAuth, async (req, res) => {
  const { question, options, answer, source, topic } = req.body || {};
  if (!question || !Array.isArray(options) || typeof answer !== 'number') {
    return res.status(400).json({ error: '题目、选项和答案为必填项' });
  }
  try {
    const { baseURL, apiKey } = await getLlmConfig();
    const prompt = `你是软考高级系统架构设计师辅导老师。请解析下面这道综合知识真题，直接给出适合移动端阅读的中文 Markdown：\n\n来源：${source || '历年真题'}\n知识点：${topic || '未分类'}\n题目：${question}\n选项：\n${options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}\n正确答案：${String.fromCharCode(65 + answer)}\n\n要求：先说明答案，再解释核心考点；逐项说明其他选项为什么不对；最后给出一句记忆要点。不要重复题目，不要编造标准或出处。`;
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3.6-27b', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 1200 }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `LLM 请求失败（${response.status}）`);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM 未返回解析内容');
    res.json({ content, model: 'qwen3.6-27b' });
  } catch (error) {
    console.error('[explain]', error);
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// 6. 首页统计（全部由后端 JSON 计算）
app.get('/api/stats', apiAuth, async (_req, res) => {
  const [progress, mistakes, attempts] = await Promise.all([
    readJson(progressFile, {}),
    readJson(mistakesFile, { items: [] }),
    readJson(attemptsFile, { items: [] }),
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

  res.json({
    totalDone: items.length,
    mistakeCount: (mistakes.items || []).length,
    recentAccuracy,
    studyDays,
    trend,
    masteryByTopic,
    studyMinutes: progress.total_study_minutes || 0,
    attempts: items, // 供前端判断错题「待复习/已掌握」
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

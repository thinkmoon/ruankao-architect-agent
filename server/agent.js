import { appendFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { CHAT_MODEL, CONTEXT_CHAR_BUDGET, MAX_OUTPUT_TOKENS, getLlmConfig } from './llm.js';
import { loadAllQuestions } from './zhenti-parser.js';
import { rebuildPlanSnapshot, readPlan, todayShanghai as planToday } from './review-plan.js';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_study_state',
      description: '读取阶段、刷题量和错题数。安排学习或复盘时用。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_materials',
      description: '检索本地复习资料中的考点定义。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_questions',
      description: '检索本地综合知识真题。出题时 include_answer=false。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          year: { type: 'string' },
          include_answer: { type: 'boolean' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_mistakes',
      description: '列出最近错题（不含长题干）。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_note',
      description: '仅当用户明确要求记录时，写入一句到 current.md。',
      parameters: {
        type: 'object',
        properties: { note: { type: 'string' } },
        required: ['note'],
      },
    },
  },
];

const TOOL_LABELS = {
  get_study_state: '读取学习状态',
  search_materials: '查阅复习资料',
  search_questions: '检索真题',
  list_mistakes: '查看错题本',
  save_note: '写入学习记录',
};

function todayShanghai() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function walkMd(dir) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkMd(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function scoreText(text, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  let score = 0;
  if (t.includes(q)) score += 8 + Math.min(8, t.split(q).length - 1);
  for (const part of q.split(/[\s,，。；、:：]+/).filter(p => p.length >= 2)) {
    if (t.includes(part)) score += 2;
  }
  return score;
}

function excerpt(text, query, max = 280) {
  const q = String(query || '').trim();
  const lower = text.toLowerCase();
  const idx = q ? lower.indexOf(q.toLowerCase()) : 0;
  const start = Math.max(0, (idx < 0 ? 0 : idx) - 40);
  const slice = text.slice(start, start + max).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + slice;
}

function clip(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function messageChars(message) {
  if (typeof message.content === 'string') return message.content.length;
  if (Array.isArray(message.content)) return message.content.map(part => part.text || '').join('').length;
  if (message.tool_calls) return JSON.stringify(message.tool_calls).length;
  return 0;
}

function clipMessage(message) {
  const copy = { ...message };
  if (copy.role === 'tool') copy.content = clip(copy.content, 900);
  else if (copy.role === 'assistant' && copy.tool_calls) {
    copy.content = copy.content ? clip(copy.content, 120) : '';
  } else if (copy.role === 'assistant') copy.content = clip(copy.content, 700);
  else if (copy.role === 'user') {
    if (typeof copy.content === 'string') copy.content = clip(copy.content, 1000);
    else if (Array.isArray(copy.content)) {
      copy.content = copy.content
        .map(part => (part.type === 'text' ? { type: 'text', text: clip(part.text, 1000) } : part))
        .filter(part => part.type === 'text' || part.type === 'image_url');
      if (!copy.content.some(part => part.type === 'text')) {
        copy.content.unshift({ type: 'text', text: '请识别截图中的软考题目，给出考点分析。' });
      }
    }
  }
  return copy;
}

function dropOldestTurn(packed) {
  const lastUser = packed.findLastIndex(m => m.role === 'user');
  if (lastUser <= 1) return false;
  const i = 1;
  if (i >= lastUser) return false;
  let j = i + 1;
  if (packed[i].role === 'assistant' && packed[i].tool_calls) {
    while (j < packed.length && packed[j].role === 'tool') j += 1;
    packed.splice(i, j - i);
    return true;
  }
  if (packed[i].role === 'user') {
    if (j < packed.length && packed[j].role === 'assistant' && packed[j].tool_calls) {
      j += 1;
      while (j < packed.length && packed[j].role === 'tool') j += 1;
    } else if (j < packed.length && packed[j].role === 'assistant') j += 1;
    packed.splice(i, j - i);
    return true;
  }
  packed.splice(i, 1);
  return true;
}

function packMessages(messages, budget = CONTEXT_CHAR_BUDGET) {
  const packed = messages.map(clipMessage);
  while (packed.reduce((n, m) => n + messageChars(m), 0) > budget) {
    if (!dropOldestTurn(packed)) {
      for (const message of packed) {
        if (message.role === 'tool') message.content = clip(message.content, 400);
      }
      break;
    }
  }
  return packed;
}

export function createAgent({ root }) {
  const stateDir = path.join(root, 'state');

  async function readJson(file, fallback) {
    try { return JSON.parse(await readFile(file, 'utf-8')); } catch { return fallback; }
  }

  async function get_study_state() {
    const [progress, current, mistakes, attempts, plan] = await Promise.all([
      readJson(path.join(stateDir, 'progress.json'), {}),
      readFile(path.join(stateDir, 'current.md'), 'utf-8').catch(() => ''),
      readJson(path.join(stateDir, 'mistakes.json'), { items: [] }),
      readJson(path.join(stateDir, 'attempts.json'), { items: [] }),
      readPlan(path.join(stateDir, 'review-plan.json')),
    ]);
    const items = attempts.items || [];
    const last20 = items.slice(-20);
    const recentAccuracy = last20.length ? last20.filter(a => a.correct).length / last20.length : 0;
    const currentPlan = plan ? rebuildPlanSnapshot(plan, items, mistakes.items || [], planToday()) : null;
    const today = currentPlan?.stats?.today;
    const phase = currentPlan?.phases?.find(item => today?.date >= item.startDate && today?.date <= item.endDate);
    return {
      phase: phase?.id || progress.phase,
      phase_title: phase?.name || null,
      last_study: progress.last_study_date,
      attempted: currentPlan?.stats?.attemptedQuestions ?? progress.attempted_questions ?? items.length,
      recent_acc: currentPlan?.stats?.last20Accuracy ?? Math.round(recentAccuracy * 1000) / 10,
      today: today || null,
      today_plan: currentPlan?.dailyPlans?.[planToday()] || null,
      due_reviews: (currentPlan?.mistakeQueue || []).filter(item => item.nextReviewAt <= planToday() && item.status !== 'mastered').slice(0, 10),
      mistakes: (mistakes.items || []).length,
      weak: (progress.weak_topics || []).slice(0, 5),
      next: clip(current, 360),
    };
  }

  async function search_materials({ query }) {
    const files = [
      ...await walkMd(path.join(root, 'reference')),
      ...await walkMd(path.join(root, 'knowledge')),
      path.join(root, 'cases', '案例考点分布与套路.md'),
    ];
    const scored = [];
    for (const file of files) {
      let text;
      try { text = await readFile(file, 'utf-8'); } catch { continue; }
      const s = scoreText(`${path.basename(file)}\n${text}`, query);
      if (s <= 0) continue;
      scored.push({ file: path.relative(root, file), score: s, excerpt: excerpt(text, query, 240) });
    }
    scored.sort((a, b) => b.score - a.score);
    return { query, hits: scored.slice(0, 2).map(({ file, excerpt }) => ({ file, excerpt })) };
  }

  function search_questions({ query, year, include_answer = false }) {
    let list = loadAllQuestions().filter(q => q.subject === '综合知识');
    if (year) list = list.filter(q => q.year === year);
    const ranked = list
      .map(q => ({ q, s: scoreText(`${q.title} ${q.topic} ${q.source} ${(q.options || []).join(' ')}`, query) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map(({ q }) => {
        const item = {
          id: q.id,
          year: q.year,
          num: q.num,
          topic: q.topic,
          title: clip(q.title, 280),
          options: (q.options || []).map(o => clip(o, 60)),
        };
        if (include_answer) item.answer = String.fromCharCode(65 + q.answer);
        return item;
      });
    return { query, year: year || null, hits: ranked };
  }

  async function list_mistakes() {
    const mistakes = await readJson(path.join(stateDir, 'mistakes.json'), { items: [] });
    const ids = (mistakes.items || []).slice(-5).map(m => m.questionId);
    const byId = new Map(loadAllQuestions().map(q => [q.id, q]));
    return {
      count: (mistakes.items || []).length,
      items: ids.map(id => {
        const q = byId.get(id);
        if (!q) return { id };
        return { id: q.id, year: q.year, num: q.num, topic: q.topic, title: clip(q.title, 80) };
      }),
    };
  }

  async function save_note({ note }) {
    const text = clip(String(note || '').trim(), 240);
    if (!text) return { ok: false, error: 'note 为空' };
    const line = `\n\n## 助手记录 ${todayShanghai()}\n\n- ${text.replace(/\n+/g, ' ')}\n`;
    await appendFile(path.join(stateDir, 'current.md'), line, 'utf-8');
    return { ok: true };
  }

  const handlers = { get_study_state, search_materials, search_questions, list_mistakes, save_note };

  async function runTool(name, args) {
    const fn = handlers[name];
    if (!fn) return { error: `未知工具 ${name}` };
    return fn(args || {});
  }

  async function complete({ messages, signal }) {
    const packed = packMessages(messages);
    const { baseURL, apiKey } = await getLlmConfig();
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: packed,
        tools: TOOLS,
        temperature: 0.3,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = data.error?.message || `LLM 请求失败（${response.status}）`;
      if (/tool/i.test(err) && packed.some(m => m.role === 'system')) {
        const retry = await fetch(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: CHAT_MODEL,
            messages: packMessages(packed.filter(m => m.role !== 'tool' && !m.tool_calls)),
            temperature: 0.3,
            max_tokens: MAX_OUTPUT_TOKENS,
          }),
          signal,
        });
        const retryData = await retry.json().catch(() => ({}));
        if (retry.ok && retryData.choices?.[0]?.message) return retryData.choices[0].message;
      }
      throw new Error(err);
    }
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('LLM 未返回内容');
    return message;
  }

  function buildSystemPrompt() {
    return `你是软考高级「系统架构设计师」备考搭档，资深同行口吻，目标 2026 下半年。用户有近十年开发经验，勿当小白科普；对齐工程经验后补考试定义、对比维度和答题关键词。

规则：
- 讲知识点先 search_materials，用本地资料表述，不编出处。
- 出真题用 search_questions 且 include_answer=false；只给题干和选项，不给答案、解析或暗示。
- 进度、今晚学什么、错题复盘先 get_study_state 或 list_mistakes。
- get_study_state 返回的 today_plan、today、due_reviews 是结构化复习计划的权威状态，优先据此安排今天任务。
- 用户明确要求记录才 save_note。
- 用户可能发题目截图；看图识题，看不清就直说，不要编题干。
- 不确定就说不确定。中文简洁，适合手机。工作日晚 1–2 小时，周末 3–4 小时。`;
  }

  function toApiMessages(history) {
    const items = history.slice(-6);
    const lastUserIdx = items.findLastIndex(item => item.role === 'me' || item.role === 'user');
    return items.map((item, i) => {
      const role = item.role === 'me' || item.role === 'user' ? 'user' : 'assistant';
      const text = clip(item.text, role === 'user' ? 1000 : 500);
      const image = typeof item.image === 'string' && item.image.startsWith('data:image/') ? item.image : '';
      if (image && role === 'user' && i === lastUserIdx) {
        return {
          role,
          content: [
            { type: 'text', text: text || '请识别截图中的软考题目，给出考点分析。看不清就直接说。' },
            { type: 'image_url', image_url: { url: image } },
          ],
        };
      }
      return { role, content: text || '（空）' };
    }).filter(m => Array.isArray(m.content) || (m.content && m.content !== '（空）'));
  }

  async function run({ history, onEvent, signal }) {
    const messages = [
      { role: 'system', content: buildSystemPrompt() },
      ...toApiMessages(history),
    ];
    for (let round = 0; round < 3; round++) {
      const message = await complete({ messages, signal });
      const calls = message.tool_calls || (message.function_call ? [{ id: 'call_1', function: message.function_call }] : []);
      if (!calls.length) {
        const text = String(message.content || '').trim() || '我这边没有生成出内容，请换一种问法再试。';
        const step = 48;
        for (let i = 0; i < text.length; i += step) onEvent('token', { text: text.slice(i, i + step) });
        return text;
      }
      messages.push({ role: 'assistant', content: message.content || '', tool_calls: calls });
      for (const call of calls) {
        const name = call.function?.name || call.name;
        let args = {};
        try { args = JSON.parse(call.function?.arguments || call.arguments || '{}'); } catch { args = {}; }
        const id = call.id || name;
        onEvent('tool', { id, title: TOOL_LABELS[name] || name, status: 'running' });
        let result;
        try { result = await runTool(name, args); onEvent('tool', { id, title: TOOL_LABELS[name] || name, status: 'completed' }); }
        catch (error) {
          result = { error: error instanceof Error ? error.message : String(error) };
          onEvent('tool', { id, title: TOOL_LABELS[name] || name, status: 'failed' });
        }
        messages.push({ role: 'tool', tool_call_id: id, content: clip(JSON.stringify(result), 900) });
      }
    }
    throw new Error('工具调用轮次过多，请把问题拆得更具体一点');
  }

  return { run, model: CHAT_MODEL };
}

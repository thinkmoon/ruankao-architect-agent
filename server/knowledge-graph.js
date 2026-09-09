import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLlmConfig } from './llm.js';
import { classifyComprehensive, examTopicList } from './topic-classify.js';
import { buildMasteryByTopic, latestAttemptByQuestion, overallMastery } from './mastery.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRAPH_FILE = path.join(ROOT, 'state', 'knowledge-graph.json');
const GRAPH_SCHEMA = 2;
let writeQueue = Promise.resolve();

const slug = value => String(value || '').trim().toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) || 'unknown';
const clean = (value, max = 240) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const domainId = topicId => `exam-domain-${topicId}`;

export const emptyGraph = () => ({ schema_version: GRAPH_SCHEMA, updatedAt: null, nodes: [], edges: [], questionLinks: {} });

export async function readKnowledgeGraph() {
  try {
    const graph = JSON.parse(await readFile(GRAPH_FILE, 'utf8'));
    return { ...emptyGraph(), ...graph, nodes: Array.isArray(graph.nodes) ? graph.nodes : [], edges: Array.isArray(graph.edges) ? graph.edges : [], questionLinks: graph.questionLinks || {} };
  } catch { return emptyGraph(); }
}

function writeGraph(graph) {
  writeQueue = writeQueue.then(() => writeFile(GRAPH_FILE, JSON.stringify(graph, null, 2) + '\n', 'utf8'));
  return writeQueue;
}

function parseJson(text) {
  const raw = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('知识点提取结果不是有效 JSON');
  return JSON.parse(raw.slice(start, end + 1));
}

function reservedNames() {
  return new Set(['软考知识体系', '综合知识', '未分类', ...examTopicList().map(topic => topic.name)]);
}

function majorityTopic(ids, questionsById) {
  const votes = new Map();
  for (const id of ids) {
    const question = questionsById.get(id);
    if (!question) continue;
    const topicId = classifyComprehensive(question).id;
    votes.set(topicId, (votes.get(topicId) || 0) + 1);
  }
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
}

export function rebuildKnowledgeGraph(previous = emptyGraph(), { questions = [], attempts = [] } = {}) {
  const now = new Date().toISOString();
  const comps = (questions || []).filter(question => question.subject === '综合知识');
  const questionsById = new Map(comps.map(question => [question.id, question]));
  const latest = latestAttemptByQuestion(attempts);
  const attemptedIds = new Set(latest.keys());
  const topics = examTopicList();
  const blocked = reservedNames();

  const root = {
    id: 'knowledge-root',
    name: '软考知识体系',
    type: 'root',
    aliases: [],
    description: '系统架构设计师综合知识考点地图',
    sourceQuestionIds: [],
    createdAt: now,
  };

  const domains = topics.map(topic => ({
    id: domainId(topic.id),
    name: topic.name,
    type: 'domain',
    examTopicId: topic.id,
    aliases: [],
    description: '综合知识考点',
    sourceQuestionIds: comps.filter(question => attemptedIds.has(question.id) && classifyComprehensive(question).id === topic.id).map(question => question.id),
    createdAt: now,
  }));

  const kept = [];
  for (const node of previous.nodes || []) {
    if (node.type !== 'concept' && node.type !== 'category') continue;
    if (blocked.has(node.name)) continue;
    const ids = [...new Set(node.sourceQuestionIds || [])].filter(id => attemptedIds.has(id) && questionsById.has(id));
    if (!ids.length) continue;
    kept.push({
      id: node.id || `knowledge-${slug(node.name)}`,
      name: node.name,
      type: node.type === 'category' ? 'category' : 'concept',
      aliases: [...new Set(node.aliases || [])],
      description: clean(node.description || '', 300),
      sourceQuestionIds: ids,
      examTopicId: majorityTopic(ids, questionsById),
      createdAt: node.createdAt || now,
    });
  }

  const unique = [];
  const byName = new Map();
  const idMap = new Map();
  for (const node of kept) {
    const existing = byName.get(node.name);
    if (!existing) {
      byName.set(node.name, node);
      unique.push(node);
      idMap.set(node.id, node.id);
      continue;
    }
    existing.sourceQuestionIds = [...new Set([...existing.sourceQuestionIds, ...node.sourceQuestionIds])];
    existing.aliases = [...new Set([...(existing.aliases || []), ...(node.aliases || [])])];
    existing.examTopicId = majorityTopic(existing.sourceQuestionIds, questionsById);
    idMap.set(node.id, existing.id);
  }

  const uniqueIds = new Set(unique.map(node => node.id));
  const nodes = [root, ...domains, ...unique];
  const edges = domains.map(domain => ({ from: root.id, to: domain.id, type: 'contains' }));
  const seen = new Set(edges.map(edge => `${edge.from}|${edge.to}|contains`));

  const pushContains = (from, to) => {
    if (!from || !to || from === to) return;
    const key = `${from}|${to}|contains`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, type: 'contains' });
  };

  for (const node of unique) {
    const domain = domains.find(item => item.examTopicId === node.examTopicId);
    const oldParentIds = (previous.edges || [])
      .filter(edge => edge.type === 'contains' && (edge.to === node.id || idMap.get(edge.to) === node.id))
      .map(edge => idMap.get(edge.from) || edge.from);
    const categoryParent = node.type === 'concept'
      ? unique.find(item => item.type === 'category' && item.examTopicId === node.examTopicId && oldParentIds.includes(item.id) && item.id !== node.id)
      : null;
    pushContains((categoryParent || domain)?.id, node.id);
  }

  for (const edge of previous.edges || []) {
    if (edge.type !== 'related') continue;
    const from = idMap.get(edge.from) || (uniqueIds.has(edge.from) ? edge.from : null);
    const to = idMap.get(edge.to) || (uniqueIds.has(edge.to) ? edge.to : null);
    if (from && to && from !== to) edges.push({ from, to, type: 'related' });
  }

  return {
    schema_version: GRAPH_SCHEMA,
    updatedAt: now,
    nodes,
    edges,
    questionLinks: previous.questionLinks || {},
  };
}

function scoreNodeMastery(questionIds, latest) {
  let attempted = 0;
  let correct = 0;
  const seen = new Set();
  for (const id of questionIds || []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const attempt = latest.get(id);
    if (!attempt) continue;
    attempted += 1;
    if (attempt.correct) correct += 1;
  }
  return {
    attemptCount: attempted,
    correctCount: correct,
    mastery: attempted ? Math.round(correct / attempted * 100) : null,
  };
}

function countContains(nodeId, edges, nodes, type) {
  const children = new Map(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    if (edge.type === 'contains') children.get(edge.from)?.push(edge.to);
  }
  let count = 0;
  const queue = [...(children.get(nodeId) || [])];
  const seen = new Set();
  while (queue.length) {
    const id = queue.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.find(item => item.id === id);
    if (node?.type === type) count += 1;
    queue.push(...(children.get(id) || []));
  }
  return count;
}

function sourceList(ids, questionsById, latest) {
  return [...new Set(ids || [])].map(id => questionsById.get(id)).filter(Boolean).slice(0, 12).map(question => ({
    id: question.id,
    title: question.title,
    source: question.source,
    correct: latest.has(question.id) ? !!latest.get(question.id).correct : null,
  }));
}

export function decorateKnowledgeGraph(graph, { attempts = [], questions = [] } = {}) {
  const latest = latestAttemptByQuestion(attempts);
  const comps = (questions || []).filter(question => question.subject === '综合知识');
  const questionsById = new Map((questions || []).map(question => [question.id, question]));
  const mastery = buildMasteryByTopic(attempts, comps);
  const masteryById = new Map(mastery.map(topic => [topic.id, topic]));
  const nodes = (graph.nodes || []).map(node => ({ ...node, sourceQuestionIds: [...(node.sourceQuestionIds || [])] }));
  const edges = graph.edges || [];
  const root = nodes.find(node => node.id === 'knowledge-root');

  for (const topic of examTopicList()) {
    const domain = nodes.find(node => node.examTopicId === topic.id);
    if (!domain) continue;
    const row = masteryById.get(topic.id);
    domain.sourceQuestionIds = row ? comps.filter(question => latest.has(question.id) && classifyComprehensive(question).id === topic.id).map(question => question.id) : [];
    domain.attemptCount = row?.attempted || 0;
    domain.correctCount = row?.correct || 0;
    domain.mastery = row ? row.value : null;
    domain.conceptCount = countContains(domain.id, edges, nodes, 'concept');
    domain.sourceQuestions = sourceList(domain.sourceQuestionIds, questionsById, latest);
  }

  if (root) {
    root.attemptCount = mastery.reduce((sum, topic) => sum + topic.attempted, 0);
    root.correctCount = mastery.reduce((sum, topic) => sum + topic.correct, 0);
    root.mastery = overallMastery(mastery);
  }

  for (const node of nodes) {
    if (node.type === 'root' || node.type === 'domain') continue;
    Object.assign(node, scoreNodeMastery(node.sourceQuestionIds, latest));
    node.sourceQuestions = sourceList(node.sourceQuestionIds, questionsById, latest);
  }

  for (const topic of mastery) {
    const domain = nodes.find(node => node.examTopicId === topic.id);
    topic.graphNodeId = domain?.id || domainId(topic.id);
    topic.conceptCount = domain?.conceptCount || 0;
  }

  return { ...graph, nodes, edges, mastery };
}

export async function persistRebuiltGraph({ questions, attempts }) {
  const next = rebuildKnowledgeGraph(await readKnowledgeGraph(), { questions, attempts });
  await writeGraph(next);
  return next;
}

export async function loadDecoratedGraph({ questions, attempts }) {
  const raw = await readKnowledgeGraph();
  const graph = raw.schema_version >= 2 && raw.nodes.some(node => node.id === 'exam-domain-architecture')
    ? raw
    : await persistRebuiltGraph({ questions, attempts });
  return decorateKnowledgeGraph(graph, { attempts, questions });
}

export async function syncQuestionToGraph(question) {
  if (!question?.id) return;
  const graph = await readKnowledgeGraph();
  if (graph.schema_version < GRAPH_SCHEMA) return;
  const topic = classifyComprehensive(question);
  const domain = graph.nodes.find(node => node.examTopicId === topic.id);
  if (!domain) return;
  domain.sourceQuestionIds = [...new Set([...(domain.sourceQuestionIds || []), question.id])];
  graph.updatedAt = new Date().toISOString();
  await writeGraph(graph);
}

function extractionPrompt({ question, options, answer, topic, explanation, existing }) {
  const opts = (options || []).map((item, i) => `${String.fromCharCode(65 + i)}. ${clean(item, 180)}`).join('\n');
  const domainNames = examTopicList().map(item => item.name).join('、');
  return `你是软考知识体系整理器。请从一道已完成的真题中提取概念节点，只返回 JSON。

本题所属领域：${clean(topic, 80)}
允许的领域：${domainNames}
已有节点：${JSON.stringify(existing)}
题目：${clean(question, 1800)}
选项：\n${opts}
正确答案：${String.fromCharCode(65 + Number(answer || 0))}
解析：${clean(explanation, 5000)}

输出格式：
{"nodes":[{"name":"工厂方法","type":"concept","parent":"设计模式","description":"...","aliases":[]}],"relations":[],"questionTags":["工厂方法"]}

规则：
1. 最多 8 个节点；只提取分类或具体概念，不要新建顶层领域。
2. parent 必须是本题所属领域，或本次/已有分类名。
3. 名称用稳定中文术语，复用已有同义节点。`;
}

function upsertNode(graph, item, fallbackParent, questionId) {
  const name = clean(item?.name, 80); if (!name) return null;
  if (reservedNames().has(name) || item.type === 'domain' || item.type === 'root') return graph.nodes.find(node => node.name === name) || null;
  const aliases = Array.isArray(item.aliases) ? item.aliases.map(v => clean(v, 60)).filter(Boolean) : [];
  const existing = graph.nodes.find(node => node.name === name || node.aliases?.includes(name) || aliases.some(alias => node.name === alias || node.aliases?.includes(alias)));
  const node = existing || { id: `knowledge-${slug(name)}`, name, type: item.type === 'category' ? 'category' : 'concept', aliases: [], description: '', sourceQuestionIds: [], createdAt: new Date().toISOString() };
  node.type = node.type === 'category' || item.type === 'category' ? 'category' : 'concept';
  node.description = clean(item.description || node.description, 300);
  node.aliases = [...new Set([...(node.aliases || []), ...aliases].filter(alias => alias !== node.name))];
  if (questionId) node.sourceQuestionIds = [...new Set([...(node.sourceQuestionIds || []), questionId])];
  if (!existing) graph.nodes.push(node);
  const parentName = clean(item.parent || fallbackParent, 80);
  const parent = graph.nodes.find(candidate => node.id !== candidate.id && (candidate.name === parentName || candidate.aliases?.includes(parentName)));
  if (parent && !graph.edges.some(edge => edge.from === parent.id && edge.to === node.id && edge.type === 'contains')) graph.edges.push({ from: parent.id, to: node.id, type: 'contains' });
  return node;
}

export async function enrichKnowledgeGraph(payload) {
  const { baseURL, apiKey, model } = await getLlmConfig();
  const graph = await readKnowledgeGraph();
  const classified = classifyComprehensive({ title: payload.question, options: payload.options });
  const domain = graph.nodes.find(node => node.examTopicId === classified.id);
  if (!domain) return graph;
  if (payload.questionId) domain.sourceQuestionIds = [...new Set([...(domain.sourceQuestionIds || []), payload.questionId])];
  const existing = graph.nodes.filter(node => node.id === domain.id || graph.edges.some(edge => edge.type === 'contains' && (edge.from === domain.id || edge.to === node.id))).slice(0, 80).map(node => ({ name: node.name, type: node.type }));
  const response = await fetch(`${baseURL}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: extractionPrompt({ ...payload, topic: classified.name, existing }) }], temperature: 0.1, max_tokens: 2500 }) });
  if (!response.ok) throw new Error((await response.text()) || `知识点提取失败（${response.status}）`);
  const data = await response.json();
  const result = parseJson(data.choices?.[0]?.message?.content);
  const extracted = Array.isArray(result.nodes) ? result.nodes.slice(0, 8) : [];
  for (const item of extracted) upsertNode(graph, item, classified.name, payload.questionId);
  for (const item of extracted) {
    const child = graph.nodes.find(node => node.name === clean(item?.name, 80));
    const parentName = clean(item?.parent || classified.name, 80);
    const parent = graph.nodes.find(node => node.name === parentName || node.aliases?.includes(parentName));
    if (child && parent && child.id !== parent.id && !graph.edges.some(edge => edge.from === parent.id && edge.to === child.id && edge.type === 'contains')) graph.edges.push({ from: parent.id, to: child.id, type: 'contains' });
  }
  for (const relation of Array.isArray(result.relations) ? result.relations.slice(0, 12) : []) {
    const from = graph.nodes.find(node => node.name === clean(relation.from, 80));
    const to = graph.nodes.find(node => node.name === clean(relation.to, 80));
    if (from && to && from.id !== to.id && !graph.edges.some(edge => edge.from === from.id && edge.to === to.id && edge.type === 'related')) graph.edges.push({ from: from.id, to: to.id, type: 'related' });
  }
  graph.questionLinks[payload.questionId] = [...new Set([...(graph.questionLinks[payload.questionId] || []), ...(Array.isArray(result.questionTags) ? result.questionTags.map(clean).filter(Boolean) : [])])];
  graph.updatedAt = new Date().toISOString();
  await writeGraph(graph);
  return graph;
}

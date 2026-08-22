import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLlmConfig } from './llm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRAPH_FILE = path.join(ROOT, 'state', 'knowledge-graph.json');
let writeQueue = Promise.resolve();

const slug = value => String(value || '').trim().toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) || 'unknown';
const clean = (value, max = 240) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

export const emptyGraph = () => ({ schema_version: 1, updatedAt: null, nodes: [], edges: [], questionLinks: {} });

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

function extractionPrompt({ question, options, answer, topic, explanation, existing }) {
  const opts = (options || []).map((item, i) => `${String.fromCharCode(65 + i)}. ${clean(item, 180)}`).join('\n');
  return `你是软考知识体系整理器。请从一道已完成的真题中提取并完善知识图谱，只返回 JSON，不要 Markdown。

已有顶层知识点和节点：${JSON.stringify(existing)}
题目主题：${clean(topic, 80)}
题目：${clean(question, 1800)}
选项：\n${opts}
正确答案：${String.fromCharCode(65 + Number(answer || 0))}
解析：${clean(explanation, 5000)}

输出格式：
{"nodes":[{"name":"设计模式","type":"domain","parent":"软件架构设计","description":"...","aliases":[]},{"name":"创建型模式","type":"category","parent":"设计模式","description":"...","aliases":[]},{"name":"工厂方法","type":"concept","parent":"创建型模式","description":"...","aliases":[]}],"relations":[{"from":"工厂方法","to":"依赖倒置原则","type":"related"}],"questionTags":["工厂方法"]}

规则：
1. 只提取对软考复习有价值的知识点，最多 8 个节点。
2. 优先建立“领域 → 分类 → 具体概念”的层级；parent 必须填写已有节点名或本次 nodes 中的节点名。
3. 只有确定存在时才建立 related 关系，不要为了凑数编造关联。
4. 名称使用稳定、常见的中文术语；不要把题干句子当成节点。
5. 如果已有节点中存在同义词，复用它的名称，并把新名称放进 aliases。`;
}

function upsertNode(graph, item, fallbackParent, questionId) {
  const name = clean(item?.name, 80); if (!name) return null;
  const aliases = Array.isArray(item.aliases) ? item.aliases.map(v => clean(v, 60)).filter(Boolean) : [];
  const existing = graph.nodes.find(node => node.name === name || node.aliases?.includes(name) || aliases.some(alias => node.name === alias || node.aliases?.includes(alias)));
  const node = existing || { id: `knowledge-${slug(name)}`, name, type: item.type || 'concept', aliases: [], description: '', sourceQuestionIds: [], createdAt: new Date().toISOString() };
  node.type = node.type || item.type || 'concept';
  node.description = clean(item.description || node.description, 300);
  node.aliases = [...new Set([...(node.aliases || []), ...aliases].filter(alias => alias !== node.name))];
  node.sourceQuestionIds = [...new Set([...(node.sourceQuestionIds || []), questionId])];
  if (!existing) graph.nodes.push(node);
  const parentName = clean(item.parent || fallbackParent, 80);
  if (parentName && parentName !== node.name) {
    const parent = graph.nodes.find(candidate => candidate.name === parentName || candidate.aliases?.includes(parentName));
    if (parent && !graph.edges.some(edge => edge.from === parent.id && edge.to === node.id && edge.type === 'contains')) graph.edges.push({ from: parent.id, to: node.id, type: 'contains' });
  }
  return node;
}

export async function enrichKnowledgeGraph(payload) {
  const { baseURL, apiKey, model } = await getLlmConfig();
  const graph = await readKnowledgeGraph();
  const existing = graph.nodes.slice(0, 100).map(node => ({ name: node.name, type: node.type, aliases: node.aliases })).filter(node => node.name);
  const response = await fetch(`${baseURL}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: extractionPrompt({ ...payload, existing }) }], temperature: 0.1, max_tokens: 2500 }) });
  if (!response.ok) throw new Error((await response.text()) || `知识点提取失败（${response.status}）`);
  const data = await response.json();
  const result = parseJson(data.choices?.[0]?.message?.content);
  const topic = clean(payload.topic, 80) || '未分类';
  const root = upsertNode(graph, { name: topic, type: 'domain', parent: '软考知识体系', description: '根据刷题记录自动积累的知识领域' }, null, payload.questionId);
  if (!graph.nodes.some(node => node.name === '软考知识体系')) graph.nodes.unshift({ id: 'knowledge-root', name: '软考知识体系', type: 'root', aliases: [], description: '软考高级系统架构设计师知识地图', sourceQuestionIds: [], createdAt: new Date().toISOString() });
  const rootNode = graph.nodes.find(node => node.id === 'knowledge-root');
  if (root && rootNode && !graph.edges.some(edge => edge.from === rootNode.id && edge.to === root.id && edge.type === 'contains')) graph.edges.push({ from: rootNode.id, to: root.id, type: 'contains' });
  const extracted = Array.isArray(result.nodes) ? result.nodes.slice(0, 8) : [];
  for (const item of extracted) upsertNode(graph, item, topic, payload.questionId);
  // 先建完全部节点，再补一次父子边，避免模型把父节点写在子节点后面时丢失层级。
  for (const item of extracted) {
    const child = graph.nodes.find(node => node.name === clean(item?.name, 80) || node.aliases?.includes(clean(item?.name, 80)));
    const parentName = clean(item?.parent || topic, 80);
    const parent = graph.nodes.find(node => node.name === parentName || node.aliases?.includes(parentName));
    if (child && parent && child.id !== parent.id && !graph.edges.some(edge => edge.from === parent.id && edge.to === child.id && edge.type === 'contains')) graph.edges.push({ from: parent.id, to: child.id, type: 'contains' });
  }
  for (const relation of Array.isArray(result.relations) ? result.relations.slice(0, 12) : []) {
    const from = graph.nodes.find(node => node.name === clean(relation.from, 80) || node.aliases?.includes(clean(relation.from, 80)));
    const to = graph.nodes.find(node => node.name === clean(relation.to, 80) || node.aliases?.includes(clean(relation.to, 80)));
    if (from && to && from.id !== to.id && !graph.edges.some(edge => edge.from === from.id && edge.to === to.id && edge.type === 'related')) graph.edges.push({ from: from.id, to: to.id, type: 'related' });
  }
  graph.questionLinks[payload.questionId] = [...new Set([...(graph.questionLinks[payload.questionId] || []), ...(Array.isArray(result.questionTags) ? result.questionTags.map(clean).filter(Boolean) : [])])];
  graph.updatedAt = new Date().toISOString();
  await writeGraph(graph);
  return graph;
}

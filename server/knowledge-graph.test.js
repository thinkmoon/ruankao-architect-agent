import test from 'node:test';
import assert from 'node:assert/strict';
import { rebuildKnowledgeGraph, decorateKnowledgeGraph } from './knowledge-graph.js';
import { buildMasteryByTopic } from './mastery.js';

test('rebuild drops old domains and reparents concepts onto exam topics', () => {
  const questions = [
    { id: 'q1', subject: '综合知识', title: 'ATAM头脑风暴的三种场景是（ ）。', options: [] },
    { id: 'q2', subject: '综合知识', title: '关系模式 R 的候选关键字是（ ）。', options: ['主键'] },
  ];
  const attempts = [
    { questionId: 'q1', topic: '综合知识', correct: false },
    { questionId: 'q1', topic: '综合知识', correct: true },
    { questionId: 'q2', topic: '综合知识', correct: false },
  ];
  const previous = {
    schema_version: 1,
    nodes: [
      { id: 'knowledge-root', name: '软考知识体系', type: 'root', sourceQuestionIds: [] },
      { id: 'knowledge-综合知识', name: '综合知识', type: 'domain', sourceQuestionIds: ['q1', 'q2'] },
      { id: 'knowledge-质量属性', name: '质量属性', type: 'domain', sourceQuestionIds: ['q1'] },
      { id: 'c1', name: 'ATAM', type: 'concept', sourceQuestionIds: ['q1'] },
    ],
    edges: [
      { from: 'knowledge-root', to: 'knowledge-综合知识', type: 'contains' },
      { from: 'knowledge-root', to: 'knowledge-质量属性', type: 'contains' },
      { from: 'knowledge-质量属性', to: 'c1', type: 'contains' },
    ],
  };
  const graph = rebuildKnowledgeGraph(previous, { attempts, questions });
  assert.equal(graph.schema_version, 2);
  assert.equal(graph.nodes.some(node => node.name === '综合知识'), false);
  assert.equal(graph.nodes.filter(node => node.type === 'domain').every(node => String(node.id).startsWith('exam-domain-')), true);
  const view = decorateKnowledgeGraph(graph, { attempts, questions });
  const quality = view.nodes.find(node => node.examTopicId === 'quality');
  const db = view.nodes.find(node => node.examTopicId === 'db');
  const mastery = buildMasteryByTopic(attempts, questions);
  assert.equal(quality.id, 'exam-domain-quality');
  assert.equal(quality.mastery, mastery.find(item => item.id === 'quality').value);
  assert.equal(quality.attemptCount, 1);
  assert.equal(db.mastery, 0);
  assert.ok(view.edges.some(edge => edge.from === 'exam-domain-quality' && edge.to === 'c1'));
  assert.equal(view.nodes.find(node => node.id === 'c1').mastery, 100);
  assert.equal(view.nodes.find(node => node.id === 'knowledge-root').mastery, 50);
});

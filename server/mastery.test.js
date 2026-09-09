import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAllQuestions } from './zhenti-parser.js';
import { classifyComprehensive } from './topic-classify.js';
import { buildMasteryByTopic, overallMastery, pickWeakTopics } from './mastery.js';

test('parser topic uses the exam-points classifier, not the catch-all 综合知识', () => {
  const questions = loadAllQuestions().filter(question => question.subject === '综合知识');
  const dump = questions.filter(question => question.topic === '综合知识').length;
  assert.equal(dump, 0);
  const atam = questions.find(question => question.title.includes('ATAM头脑风暴'));
  assert.equal(atam.topic, '质量属性与架构评估');
  assert.equal(classifyComprehensive(atam).name, atam.topic);
});

test('mastery ignores stored attempt.topic and uses latest attempt per question', () => {
  const questions = [
    { id: '2024下-001', title: 'ATAM头脑风暴的三种场景是（ ）。', options: [] },
    { id: '2024下-002', title: '关系模式 R 的候选关键字是（ ）。', options: ['主键', '外键'] },
  ];
  const attempts = [
    { questionId: '2024下-001', topic: '综合知识', correct: false },
    { questionId: '2024下-001', topic: '综合知识', correct: true },
    { questionId: '2024下-002', topic: '综合知识', correct: false },
  ];
  const mastery = buildMasteryByTopic(attempts, questions);
  assert.deepEqual(mastery.map(item => item.subject).sort(), ['数据库', '质量属性与架构评估']);
  assert.equal(mastery.find(item => item.id === 'quality').value, 100);
  assert.equal(mastery.find(item => item.id === 'quality').attempted, 1);
  assert.equal(mastery.find(item => item.id === 'db').value, 0);
  assert.equal(overallMastery(mastery), 50);
});

test('weak topics skip 其他 and one-off misses', () => {
  const topics = [
    { id: 'other', subject: '其他', attempted: 20, correct: 0, value: 0 },
    { id: 'db', subject: '数据库', attempted: 1, correct: 0, value: 0 },
    { id: 'network', subject: '计算机网络', attempted: 7, correct: 2, value: 29 },
    { id: 'architecture', subject: '软件架构设计', attempted: 22, correct: 11, value: 50 },
  ];
  const weak = pickWeakTopics(topics);
  assert.deepEqual(weak.map(item => item.id), ['network', 'architecture']);
});

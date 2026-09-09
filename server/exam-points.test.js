import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  buildExamPoints,
  classifyCase,
  classifyComprehensive,
  classifyEssay,
  loadExamPoints,
  parseEssays,
  yearSortKey,
} from './exam-points.js';
import { loadCases } from './cases.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('yearSortKey orders 上 before 下 in the same year', () => {
  assert.ok(yearSortKey('2024上') < yearSortKey('2024下'));
  assert.ok(yearSortKey('2024下') < yearSortKey('2025上'));
});

test('parseEssays keeps four titles per sitting', () => {
  const essays = parseEssays(`# 论文\n## 试题一：论无服务器架构\n正文\n## 试题二：论基于云原生数据库的企业信息系统架构\n正文\n## 试题三：论系统性能测试技术及其应用\n正文\n## 试题四：论秒杀场景设计及解决方案\n`, '2025下');
  assert.equal(essays.length, 4);
  assert.equal(essays[0].title, '论无服务器架构');
  assert.equal(classifyEssay(essays[0]).name, '云原生 / 微服务 / Serverless');
  assert.equal(classifyEssay(essays[3]).name, '分布式与高并发');
});

test('known cases map onto review topics', () => {
  const cases = loadCases(root);
  const pick = (year, num) => cases.find(item => item.year === year && item.num === num);
  assert.equal(classifyCase(pick('2020下', 1)).name, '架构设计与评估');
  assert.equal(classifyCase(pick('2020下', 2)).name, 'UML / 系统建模');
  assert.equal(classifyCase(pick('2020下', 3)).name, '嵌入式系统');
  assert.equal(classifyCase(pick('2021下', 1)).name, '架构设计与评估');
  assert.equal(classifyCase(pick('2024下', 2)).name, 'Redis / 缓存');
  assert.equal(classifyCase(pick('2025上', 5)).name, '区块链流程');
  assert.equal(classifyCase(pick('2025下', 5)).name, 'Petri 网建模');
});

test('loadExamPoints splits three subjects and recent window', () => {
  const data = loadExamPoints(root);
  assert.equal(data.meta.years.length, 8);
  assert.deepEqual(data.meta.recentYears, ['2023下', '2024上', '2024下', '2025上', '2025下']);
  assert.equal(data.all.comprehensive.questionCount, 599);
  assert.equal(data.all.case.questionCount, 40);
  assert.equal(data.all.essay.questionCount, 32);
  assert.equal(data.all.comprehensive.paperScore, 75);
  assert.equal(data.all.case.itemScore, 25);
  assert.equal(data.all.essay.itemScore, 75);
  const avgSum = data.all.comprehensive.topics.reduce((sum, topic) => sum + topic.avgPointsPerPaper, 0);
  assert.ok(avgSum > 70 && avgSum < 80, `avg sum ${avgSum}`);
  assert.ok(data.all.case.topics.some(topic => topic.band === '必考' && topic.name === '架构设计与评估'));
  assert.ok(data.all.case.topics.some(topic => topic.name === 'UML / 系统建模' && topic.count >= 5));
  assert.ok(data.all.comprehensive.topics[0].id !== 'other');
  const otherShare = data.all.comprehensive.topics.find(topic => topic.id === 'other')?.share || 0;
  assert.ok(otherShare < 8, `other share too high: ${otherShare}`);
});

test('english and architecture stems are classified before the catch-all', () => {
  assert.equal(classifyComprehensive({ title: 'Blackboard architecture, also known as the blackboard system, is a problem-solving approach that utilizes a model of knowledge sources. The purpose of this architecture is to', options: ['A', 'B'] }).id, 'english');
  assert.equal(classifyComprehensive({ title: 'ATAM头脑风暴的三种场景是（ ）。', options: [] }).name, '质量属性与架构评估');
  assert.equal(classifyComprehensive({ title: '某项目包括四道工序。在最短工期情况下至少需要多少工程费用。 > 来源说明：见 https://blog.csdn.net/foo 与 HTTPS 页面' }).name, '项目管理');
  assert.equal(classifyComprehensive({ title: '在白盒测试中，测试强度最高的是（ ）。' }).name, '软件工程');
  assert.equal(classifyComprehensive({ title: '平均失效等待时间（mean time to failure，MTTF）是进行系统可靠性分析时的重要指标。' }).name, '质量属性与架构评估');
  assert.equal(classifyComprehensive({ title: '下列表达式与 R∩S 等价的是（ ）。' }).name, '数据库');
  assert.equal(classifyComprehensive({ title: '软件体系结构风格是描述某一特定应用领域中系统组织方式的惯用模式，其中在批处理风格软件体系结构中' }).name, '软件架构设计');
});

test('web overlay attaches official 60% and the case-count conflict', () => {
  const data = loadExamPoints(root);
  assert.equal(data.verification.official.passRule, '各科目合格标准为试卷满分的 60%');
  assert.equal(data.verification.official.impliedPassScore, 45);
  assert.ok(data.verification.conflicts.some(item => item.id === 'case-question-count' && /4 题选 3/.test(item.claimB)));
  assert.equal(data.verification.latestSitting.year, '2026上');
  const architecture = data.recent.comprehensive.topics.find(topic => topic.id === 'architecture');
  assert.equal(architecture.web.pointsMin, 16);
  assert.equal(architecture.web.pointsMax, 28);
  assert.ok(architecture.web.combinedLocal >= 14 && architecture.web.combinedLocal <= 28);
  assert.ok(architecture.web.combinedIds.includes('quality'));
});

test('exam points stay usable without the web overlay', () => {
  const data = buildExamPoints({ questions: [], cases: [], essays: [], web: null });
  assert.equal(data.verification, null);
  assert.equal(data.recent.comprehensive.topics.length, 0);
  assert.match(data.meta.scoringNote, /45/);
});

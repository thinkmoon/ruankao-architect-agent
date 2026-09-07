import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCases, parseCases, publicCase, validateCaseAnswers } from './cases.js';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
test('all 40 cases retain subquestions and nonofficial references', () => {
  const cases = loadCases(root);
  assert.equal(cases.length, 40);
  assert.equal(new Set(cases.map(q => q.id)).size, 40);
  for (const q of cases) {
    assert.ok(q.parts.length >= 2, q.id);
    assert.ok(q.reference.length > 100, q.id);
    assert.ok(!('reference' in publicCase(q)));
    for (const p of q.parts) assert.ok(p.text.length > 5, `${q.id}/${p.id}`);
  }
});
test('interleaved answers are removed without swallowing later questions and tables', () => {
  const [q] = parseCases('## 试题一（25分）\r\n材料\r\n### 问题 1（12分）\r\n|A|B|\r\n|---|---|\r\n#### 参考答案（非官方）\r\nSECRET_ONE\r\n### 问题 2（13分）\r\n第二问\r\n#### 参考答案（非官方）\r\nSECRET_TWO', '2022下');
  assert.equal(q.parts.length, 2);
  assert.match(q.parts[0].text, /\|A\|B\|\n\|---\|---\|/);
  assert.doesNotMatch(JSON.stringify(publicCase(q)), /SECRET/);
  assert.match(q.reference, /SECRET_ONE/); assert.match(q.reference, /SECRET_TWO/);
});
test('central answer section cannot leak its question headings into the exercise', () => {
  const [q] = parseCases('## 试题一\n材料\n#### 问题1（25分）\n题面\n### 参考答案与解析（非官方）\n#### 问题1\nSECRET', '2025下');
  assert.equal(q.parts.length, 1); assert.doesNotMatch(JSON.stringify(publicCase(q)), /SECRET/);
});
test('reject empty, malformed, oversized and injected answer keys; allow unanswered parts', () => {
  const q = loadCases(root)[0];
  const answers = Object.fromEntries(q.parts.map(p => [p.id, '']));
  assert.equal(validateCaseAnswers(q, answers), false);
  answers[q.parts[0].id] = '我的作答'; assert.equal(validateCaseAnswers(q, answers), true);
  assert.equal(validateCaseAnswers(q, {...answers, unknown: 'x'}), false);
  answers[q.parts[0].id] = 'x'.repeat(6001); assert.equal(validateCaseAnswers(q, answers), false);
  assert.equal(validateCaseAnswers(q, []), false);
});

test('case tasks require submitted cases; mixed knowledge tasks require both time and a case', async () => {
  const { rebuildPlanSnapshot } = await import('./review-plan.js');
  const date = '2026-09-07';
  const plan = { phases: [], dailyPlans: { [date]: { tasks: [
    { id: 'c', type: 'case', target: 2, estimatedMinutes: 30 },
    { id: 'k', type: 'knowledge', title: '复习一个考纲模块并完成对应案例', estimatedMinutes: 90 },
    { id: 'q', type: 'questions', target: 1 },
  ] } } };
  const run = evidence => rebuildPlanSnapshot(structuredClone(plan), [], [], date, evidence).dailyPlans[date].tasks.map(t => t.status);
  assert.deepEqual(run({studyMinutesToday: 120, caseCountToday: 0}), ['pending','pending','pending']);
  assert.deepEqual(run({studyMinutesToday: 0, caseCountToday: 2}), ['completed','pending','pending']);
  assert.deepEqual(run({studyMinutesToday: 120, caseCountToday: 2}), ['completed','completed','pending']);
});

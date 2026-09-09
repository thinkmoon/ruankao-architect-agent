import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCases, parseCases, publicCase, validateCaseAnswers, validateCasePartAnswer, applyCasePartSubmission, casePartAlreadySubmitted, casePartGradePrompt } from './cases.js';
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
    assert.ok(publicCase(q).parts.every(p => !('reference' in p)), q.id);
    for (const p of q.parts) assert.ok(p.text.length > 5, `${q.id}/${p.id}`);
  }
});
test('interleaved answers are removed without swallowing later questions and tables', () => {
  const [q] = parseCases('## 试题一（25分）\r\n材料\r\n### 问题 1（12分）\r\n|A|B|\r\n|---|---|\r\n#### 参考答案（非官方）\r\nSECRET_ONE\r\n### 问题 2（13分）\r\n第二问\r\n#### 参考答案（非官方）\r\nSECRET_TWO', '2022下');
  assert.equal(q.parts.length, 2);
  assert.match(q.parts[0].text, /\|A\|B\|\n\|---\|---\|/);
  assert.doesNotMatch(JSON.stringify(publicCase(q)), /SECRET/);
  assert.match(q.reference, /SECRET_ONE/); assert.match(q.reference, /SECRET_TWO/);
  assert.match(q.parts[0].reference, /SECRET_ONE/);
  assert.doesNotMatch(q.parts[0].reference, /SECRET_TWO/);
  assert.match(q.parts[1].reference, /SECRET_TWO/);
});
test('central answer section cannot leak its question headings into the exercise', () => {
  const [q] = parseCases('## 试题一\n材料\n#### 问题1（25分）\n题面\n### 参考答案与解析（非官方）\n#### 问题1\nSECRET', '2025下');
  assert.equal(q.parts.length, 1); assert.doesNotMatch(JSON.stringify(publicCase(q)), /SECRET/);
  assert.match(q.parts[0].reference, /SECRET/);
});
test('bracketed centralized answers are attached to the matching part', () => {
  const [q] = parseCases('## 试题一\n材料\n### 问题 1（9分）\n题面一\n### 问题 2（16分）\n题面二\n### 参考答案与解析（非官方）\n【问题1】\nSECRET_ONE\n【问题2】\nSECRET_TWO', '2021下');
  assert.equal(q.parts.length, 2);
  assert.match(q.parts[0].reference, /SECRET_ONE/);
  assert.doesNotMatch(q.parts[0].reference, /SECRET_TWO/);
  assert.match(q.parts[1].reference, /SECRET_TWO/);
  assert.doesNotMatch(JSON.stringify(publicCase(q)), /SECRET/);
});
test('versioned bracket headings still map to the numeric part id', () => {
  const [q] = parseCases('## 试题一\n材料\n#### 问题 1（7分）\n题面一\n#### 问题 2（12分）\n题面二\n#### 问题 3（6分）\n题面三\n### 参考答案与解析（非官方）\n【问题1，两个版本通用】\nSECRET_ONE\n【公开 PDF 版本问题2】\nSECRET_TWO\n【公开 PDF 版本问题3】\nSECRET_THREE_A\n【考后回忆版本问题3】\nSECRET_THREE_B', '2024上');
  assert.match(q.parts[0].reference, /SECRET_ONE/);
  assert.match(q.parts[1].reference, /SECRET_TWO/);
  assert.match(q.parts[2].reference, /SECRET_THREE_A/);
  assert.match(q.parts[2].reference, /SECRET_THREE_B/);
  assert.doesNotMatch(JSON.stringify(publicCase(q)), /SECRET/);
});
test('reject empty, malformed, oversized and injected answer keys; allow unanswered parts', () => {
  const q = loadCases(root)[0];
  const answers = Object.fromEntries(q.parts.map(p => [p.id, '']));
  assert.equal(validateCaseAnswers(q, answers), false);
  answers[q.parts[0].id] = '我的作答'; assert.equal(validateCaseAnswers(q, answers), true);
  assert.equal(validateCaseAnswers(q, {...answers, unknown: 'x'}), false);
  answers[q.parts[0].id] = 'x'.repeat(6001); assert.equal(validateCaseAnswers(q, answers), false);
  assert.equal(validateCaseAnswers(q, []), false);
  assert.equal(validateCasePartAnswer(q, q.parts[0].id, '我的作答'), true);
  assert.equal(validateCasePartAnswer(q, q.parts[0].id, '  '), false);
  assert.equal(validateCasePartAnswer(q, '999', '我的作答'), false);
  assert.equal(validateCasePartAnswer(q, q.parts[0].id, 'x'.repeat(6001)), false);
});

test('per-part submit keeps other parts unanswered and does not copy their references', () => {
  const q = loadCases(root)[0];
  const first = applyCasePartSubmission(q, null, q.parts[0].id, '第一问作答');
  assert.equal(first.status, q.parts.length === 1 ? 'submitted' : 'in_progress');
  assert.equal(first.answers[q.parts[0].id], '第一问作答');
  assert.equal(casePartAlreadySubmitted(first, q.parts[0].id), true);
  if (q.parts[1]) {
    assert.equal(casePartAlreadySubmitted(first, q.parts[1].id), false);
    assert.equal(first.partReferences[q.parts[1].id], undefined);
    const second = applyCasePartSubmission(q, first, q.parts[1].id, '第二问作答');
    assert.equal(second.answers[q.parts[0].id], '第一问作答');
    assert.equal(second.partReferences[q.parts[0].id], first.partReferences[q.parts[0].id]);
  }
  const prompt = casePartGradePrompt(q, q.parts[0], '第一问作答');
  assert.match(prompt, /本次只评阅一个小问/);
  const payload = JSON.parse(prompt.slice(prompt.indexOf('{')));
  assert.equal(payload.part.id, q.parts[0].id);
  assert.equal(payload.answer, '第一问作答');
  assert.equal(payload.reference, q.parts[0].reference || '');
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

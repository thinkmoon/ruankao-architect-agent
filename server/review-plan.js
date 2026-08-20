import { readFile, writeFile } from 'node:fs/promises';

export function todayShanghai(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function phaseForDate(plan, date = todayShanghai()) {
  return (plan.phases || []).find(phase => date >= phase.startDate && date <= phase.endDate) || null;
}

function defaultTask(date, phase, plan) {
  const minutes = plan.dailyTargets?.studyMinutes || 90;
  const definitions = {
    baseline: ['questions', '完成综合知识真题摸底', 60],
    foundation: ['knowledge', '复习一个考纲模块并完成对应案例', minutes],
    essay: ['essay', '练习论文结构或项目素材', minutes],
    sprint: ['mock', '全科模拟或集中查漏补缺', minutes],
  };
  const [type, title, estimatedMinutes] = definitions[phase?.id] || ['setup', '确定今天的学习内容', 30];
  return { id: `${date}-${type}`, type, title, estimatedMinutes, priority: 'high', status: 'pending' };
}

export function ensureDailyPlan(plan, date = todayShanghai()) {
  plan.dailyPlans ||= {};
  if (plan.dailyPlans[date]) return plan.dailyPlans[date];
  const phase = phaseForDate(plan, date);
  const day = new Date(`${date}T12:00:00+08:00`).getDay();
  const plannedMinutes = [0, 6].includes(day) ? (plan.dailyTargets?.studyMinutesWeekend || 210) : (plan.dailyTargets?.studyMinutesWeekday || 90);
  plan.dailyPlans[date] = {
    date,
    phaseId: phase?.id || null,
    status: 'planned',
    plannedMinutes,
    tasks: [defaultTask(date, phase, plan), { id: `${date}-review`, type: 'review', title: '复习到期错题', estimatedMinutes: 20, priority: 'medium', status: 'pending' }],
    notes: '',
  };
  return plan.dailyPlans[date];
}

function lastAttemptsByQuestion(attempts) {
  const map = new Map();
  for (const attempt of attempts) map.set(attempt.questionId, attempt);
  return map;
}

export function rebuildPlanSnapshot(plan, attempts = [], mistakes = [], date = todayShanghai()) {
  const today = ensureDailyPlan(plan, date);
  const todayAttempts = attempts.filter(item => todayShanghai(new Date(item.answeredAt || 0)) === date);
  const byQuestion = lastAttemptsByQuestion(attempts);
  plan.mistakeQueue = (mistakes || []).map(mistake => {
    const latest = byQuestion.get(mistake.questionId);
    const wrongAttempts = attempts.filter(item => item.questionId === mistake.questionId && !item.correct);
    const lastWrong = [...wrongAttempts].reverse()[0];
    const nextReviewAt = mistake.nextReviewAt || addDays((lastWrong && todayShanghai(new Date(lastWrong.answeredAt))) || mistake.addedAt || date, 1);
    const consecutiveCorrect = [...attempts].reverse().filter(item => item.questionId === mistake.questionId).slice(0, 3).filter(item => item.correct).length;
    const mastered = consecutiveCorrect >= (plan.reviewPolicy?.masteredAfterConsecutiveCorrect || 3);
    return {
      mistakeId: mistake.questionId,
      sourceRef: mistake.questionId,
      topic: latest?.topic || '',
      subject: latest?.subject || '综合知识',
      wrongCount: wrongAttempts.length,
      lastWrongAt: lastWrong ? todayShanghai(new Date(lastWrong.answeredAt)) : (mistake.addedAt || date),
      nextReviewAt,
      intervalDays: mistake.intervalDays || 1,
      ease: mistake.ease || 2.5,
      status: mastered ? 'mastered' : (nextReviewAt <= date ? 'due' : 'scheduled'),
      priority: wrongAttempts.length >= 2 ? 'high' : 'medium',
      reviewHistory: mistake.reviewHistory || [],
    };
  });
  const due = plan.mistakeQueue.filter(item => item.nextReviewAt <= date && item.status !== 'mastered');
  const completedQuestions = todayAttempts.length;
  for (const task of today.tasks) {
    if (task.type === 'questions' && completedQuestions >= (plan.dailyTargets?.questions || 20)) { task.status = 'completed'; task.completedAt ||= date; }
    if (task.type === 'review' && due.length === 0) { task.status = 'completed'; task.completedAt ||= date; }
  }
  today.status = today.tasks.every(task => task.status === 'completed') ? 'completed' : 'in_progress';
  const last20 = attempts.slice(-20);
  plan.stats = {
    asOf: date,
    attemptedQuestions: attempts.length,
    last20Accuracy: last20.length ? Math.round(last20.filter(item => item.correct).length / last20.length * 1000) / 10 : 0,
    today: {
      date,
      attemptedQuestions: completedQuestions,
      correctQuestions: todayAttempts.filter(item => item.correct).length,
      dueReviews: due.length,
      plannedMinutes: today.plannedMinutes,
    },
  };
  plan.updatedAt = new Date().toISOString();
  return plan;
}

export async function readPlan(file) {
  try { return JSON.parse(await readFile(file, 'utf-8')); } catch { return null; }
}

export async function writePlan(file, plan) {
  await writeFile(file, JSON.stringify(plan, null, 2) + '\n', 'utf-8');
}

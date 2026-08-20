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

function chronologicalAttempts(attempts, questionId) {
  return attempts.filter(item => item.questionId === questionId)
    .sort((a, b) => new Date(a.answeredAt || 0) - new Date(b.answeredAt || 0));
}

// 错题的复习周期只由真实答题事件推进，不能由 UI 点击推进。
function scheduleForMistake(mistake, attempts, policy, asOf) {
  const history = chronologicalAttempts(attempts, mistake.questionId);
  const wrongAttempts = history.filter(item => !item.correct);
  const lastWrong = wrongAttempts.at(-1);
  let intervalDays = 1;
  let nextReviewAt = addDays(lastWrong ? todayShanghai(new Date(lastWrong.answeredAt)) : (mistake.addedAt || asOf), 1);
  let consecutiveCorrect = 0;
  const reviewHistory = [];
  for (const attempt of history) {
    if (!attempt.correct) {
      intervalDays = 1;
      consecutiveCorrect = 0;
      nextReviewAt = addDays(todayShanghai(new Date(attempt.answeredAt)), 1);
      continue;
    }
    consecutiveCorrect++;
    const step = Math.min(consecutiveCorrect - 1, (policy?.intervalDays || [1, 3, 7, 14]).length - 1);
    intervalDays = policy?.intervalDays?.[step] || [1, 3, 7, 14][step] || 14;
    const reviewedAt = todayShanghai(new Date(attempt.answeredAt));
    nextReviewAt = addDays(reviewedAt, intervalDays);
    reviewHistory.push({ answeredAt: attempt.answeredAt, correct: true, intervalDays, nextReviewAt });
  }
  const mastered = consecutiveCorrect >= (policy?.masteredAfterConsecutiveCorrect || 3);
  return { wrongAttempts, lastWrong, intervalDays, nextReviewAt, consecutiveCorrect, mastered, reviewHistory };
}

function meetsCriterion(criterion, metrics) {
  const actual = metrics[criterion.metric] || 0;
  return actual >= criterion.target;
}

function updatePhaseStatuses(plan, metrics, date) {
  const defaults = {
    baseline: [{ metric: 'attemptedQuestions', target: 100, label: '累计完成 100 道摸底题' }],
    foundation: [{ metric: 'studyMinutes', target: 1800, label: '累计学习 30 小时' }],
    essay: [{ metric: 'completedDays', target: 5, label: '完成 5 个有效学习日' }],
    sprint: [{ metric: 'masteredMistakes', target: 20, label: '掌握 20 道错题' }],
  };
  for (const phase of plan.phases || []) {
    const criteria = phase.completionCriteria || defaults[phase.id] || [];
    phase.completionCriteria = criteria;
    phase.progress = criteria.map(item => ({ ...item, actual: metrics[item.metric] || 0, met: meetsCriterion(item, metrics) }));
    const completed = criteria.length > 0 && phase.progress.every(item => item.met);
    phase.status = completed ? 'completed' : (date >= phase.startDate && date <= phase.endDate ? 'active' : 'planned');
    phase.completedAt = completed ? (phase.completedAt || date) : undefined;
  }
}

export function rebuildPlanSnapshot(plan, attempts = [], mistakes = [], date = todayShanghai(), evidence = {}) {
  const today = ensureDailyPlan(plan, date);
  const todayAttempts = attempts.filter(item => todayShanghai(new Date(item.answeredAt || 0)) === date);
  const byQuestion = lastAttemptsByQuestion(attempts);
  plan.mistakeQueue = (mistakes || []).map(mistake => {
    const latest = byQuestion.get(mistake.questionId);
    const schedule = scheduleForMistake(mistake, attempts, plan.reviewPolicy, date);
    return {
      mistakeId: mistake.questionId, sourceRef: mistake.questionId,
      topic: latest?.topic || '', subject: latest?.subject || '综合知识',
      wrongCount: schedule.wrongAttempts.length,
      lastWrongAt: schedule.lastWrong ? todayShanghai(new Date(schedule.lastWrong.answeredAt)) : (mistake.addedAt || date),
      nextReviewAt: schedule.nextReviewAt, intervalDays: schedule.intervalDays,
      ease: mistake.ease || 2.5,
      status: schedule.mastered ? 'mastered' : (schedule.nextReviewAt <= date ? 'due' : 'scheduled'),
      priority: schedule.wrongAttempts.length >= 2 ? 'high' : 'medium',
      consecutiveCorrect: schedule.consecutiveCorrect,
      reviewHistory: schedule.reviewHistory,
    };
  });
  const due = plan.mistakeQueue.filter(item => item.nextReviewAt <= date && item.status !== 'mastered');
  const completedQuestions = todayAttempts.length;
  for (const task of today.tasks) {
    task.status = 'pending';
    delete task.completedAt;
    if (task.type === 'questions' && completedQuestions >= (task.target || plan.dailyTargets?.questions || 20)) { task.status = 'completed'; task.completedAt = date; }
    // 没有到期错题时无需复习；有到期错题必须通过真实答题消化。
    if (task.type === 'review' && due.length === 0) { task.status = 'completed'; task.completedAt = date; }
    if (!['questions', 'review'].includes(task.type) && Number(evidence.studyMinutesToday || 0) >= task.estimatedMinutes) {
      task.status = 'completed'; task.completedAt = date;
    }
  }
  today.status = today.tasks.every(task => task.status === 'completed') ? 'completed' : 'in_progress';
  const last20 = attempts.slice(-20);
  const studyMinutes = Number(evidence.studyMinutes ?? plan.stats?.studyMinutes ?? 0);
  const metrics = {
    attemptedQuestions: attempts.length,
    studyMinutes,
    completedDays: Object.values(plan.dailyPlans || {}).filter(day => day.status === 'completed').length,
    masteredMistakes: plan.mistakeQueue.filter(item => item.status === 'mastered').length,
  };
  updatePhaseStatuses(plan, metrics, date);
  plan.stats = {
    asOf: date,
    attemptedQuestions: attempts.length,
    studyMinutes,
    completedDays: metrics.completedDays,
    masteredMistakes: metrics.masteredMistakes,
    last20Accuracy: last20.length ? Math.round(last20.filter(item => item.correct).length / last20.length * 1000) / 10 : 0,
    today: {
      date,
      attemptedQuestions: completedQuestions,
      correctQuestions: todayAttempts.filter(item => item.correct).length,
      dueReviews: due.length,
      studyMinutes: Number(evidence.studyMinutesToday || 0),
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

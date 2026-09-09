import { classifyComprehensive } from './topic-classify.js';

export function latestAttemptByQuestion(attempts) {
  const latest = new Map();
  for (const item of attempts || []) {
    if (!item?.questionId) continue;
    latest.set(item.questionId, item);
  }
  return latest;
}

export function buildMasteryByTopic(attempts, questions) {
  const latest = latestAttemptByQuestion(attempts);
  const byId = new Map((questions || []).map(question => [question.id, question]));
  const grouped = new Map();
  for (const [questionId, attempt] of latest) {
    const question = byId.get(questionId);
    if (!question) continue;
    const topic = classifyComprehensive(question);
    const row = grouped.get(topic.id) || { id: topic.id, subject: topic.name, attempted: 0, correct: 0 };
    row.attempted += 1;
    if (attempt.correct) row.correct += 1;
    grouped.set(topic.id, row);
  }
  return [...grouped.values()].map(row => ({
    ...row,
    value: Math.round(row.correct / row.attempted * 100),
  })).sort((a, b) => {
    if (a.id === 'other') return 1;
    if (b.id === 'other') return -1;
    return a.value - b.value || b.attempted - a.attempted;
  });
}

export function overallMastery(topics) {
  const attempted = (topics || []).reduce((sum, topic) => sum + topic.attempted, 0);
  const correct = (topics || []).reduce((sum, topic) => sum + topic.correct, 0);
  return attempted ? Math.round(correct / attempted * 100) : 0;
}

export function pickWeakTopics(topics, limit = 2) {
  const eligible = (topics || []).filter(topic => topic.id !== 'other' && topic.attempted >= 3);
  const pool = eligible.length ? eligible : (topics || []).filter(topic => topic.id !== 'other');
  return [...pool].sort((a, b) => a.value - b.value || b.attempted - a.attempted).slice(0, limit);
}

export function radarTopics(topics, limit = 8) {
  return [...(topics || [])]
    .filter(topic => topic.id !== 'other')
    .sort((a, b) => b.attempted - a.attempted)
    .slice(0, limit);
}

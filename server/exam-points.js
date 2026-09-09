import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadAllQuestions } from './zhenti-parser.js';
import { loadCases } from './cases.js';
import { classifyComprehensive, matchTopic, OTHER } from './topic-classify.js';

export { classifyComprehensive } from './topic-classify.js';

/** 软考高级常规卷面结构。及格线有官方 60% 依据；章节分值仍是估算。 */
export const EXAM_SCORING = {
  comprehensive: {
    paperScore: 75,
    itemScore: 1,
    passScore: 45,
    note: '综合知识通常 75 题、每题 1 分。官方规定各科及格为满分的 60%；75 分来自历年卷面，通告未写满分数字。下列分值按本地真题出现次数估算。',
  },
  case: {
    paperScore: 75,
    itemScore: 25,
    choose: 3,
    available: 5,
    requiredFirst: true,
    passScore: 45,
    note: '案例分析通常 5 题各 25 分。希赛、明航、2026 上考生回忆：试题一必做，后 4 选 2，共答 3 题共 75 分。技术栈写「4 题选 3」与其余来源冲突，不采用。当次试卷为准。',
  },
  essay: {
    paperScore: 75,
    itemScore: 75,
    choose: 1,
    available: 4,
    passScore: 45,
    note: '论文通常 4 题选 1，按 75 分计。建议深准备 3 个方向，而不是押单题。',
  },
};

const WEB_OVERLAY_FILE = 'knowledge/exam-points-web.json';

const CASE_TOPICS = [
  { id: 'petri', name: 'Petri 网建模', keywords: ['Petri'] },
  { id: 'cache', name: 'Redis / 缓存', keywords: ['Redis', 'Cache-Aside', '缓存', '分布式锁', 'ElastiCache'] },
  { id: 'blockchain', name: '区块链流程', keywords: ['区块链'] },
  { id: 'ai', name: 'AI / 知识图谱', keywords: ['知识图谱', '智能问答', '端侧 AI', '机器学习应用'] },
  { id: 'safety', name: '安全关键系统', keywords: ['安全关键', '胰岛素'] },
  { id: 'bigdata', name: '大数据 / GIS', keywords: ['GIS', '大数据架构', '数据存储'] },
  { id: 'embedded', name: '嵌入式系统', keywords: ['嵌入式', 'ROS', 'AIOS', '车载', 'FACE', '宇航'] },
  { id: 'uml', name: 'UML / 系统建模', keywords: ['系统设计与建模', '软件系统设计与建模', '软件系统建模', 'UML', '用例图', '类图', '顺序图', '建模'] },
  { id: 'database', name: '数据库设计', keywords: ['数据库设计'] },
  { id: 'web', name: 'Web / 分布式架构', keywords: ['Web系统', 'Web电商', 'Web 架构', '电商平台', '混合', '边缘计算的智能门禁'] },
  { id: 'arch', name: '架构设计与评估', keywords: ['架构设计与评估', '软件架构评估', '架构评估', '质量属性', '质量需求', '系统架构设计', '面向质量属性'] },
];

const ESSAY_TOPICS = [
  { id: 'cloud-native', name: '云原生 / 微服务 / Serverless', keywords: ['云原生', '微服务', '无服务器', 'Serverless'] },
  { id: 'data', name: '数据架构与集成', keywords: ['数据分片', '湖仓', '大数据架构', '多源', '多模型', '数据集成'] },
  { id: 'testing', name: '软件测试与性能', keywords: ['软件测试', '缺陷管理', '单元测试', '性能测试'] },
  { id: 'maintenance', name: '软件维护', keywords: ['软件维护'] },
  { id: 'security', name: '系统安全架构', keywords: ['安全架构'] },
  { id: 'distributed', name: '分布式与高并发', keywords: ['分布式事务', '负载均衡', '秒杀'] },
  { id: 'style', name: 'SOA / 事件驱动 / MDA', keywords: ['面向服务', '事件驱动', '模型驱动'] },
  { id: 'integration', name: '企业集成', keywords: ['企业集成'] },
  { id: 'edge', name: '边缘计算', keywords: ['边缘计算'] },
  { id: 'cbse', name: '构件 / AOP', keywords: ['构件', '面向方面', 'AOP'] },
  { id: 'reliability', name: '软件可靠性', keywords: ['可靠性'] },
  { id: 'oop', name: '面向对象建模', keywords: ['面向对象'] },
  { id: 'ops', name: '云上运维', keywords: ['自动化运维'] },
  { id: 'blockchain', name: '区块链', keywords: ['区块链'] },
];

export function yearSortKey(year) {
  const match = String(year).match(/^(\d{4})([上下])?/);
  if (!match) return 0;
  return Number(match[1]) * 10 + (match[2] === '下' ? 1 : 0);
}

export function sortYears(years) {
  return [...new Set(years)].sort((a, b) => yearSortKey(a) - yearSortKey(b));
}

export function caseDisplayTitle(question) {
  const stripped = String(question?.title || '').replace(/^试题[一二三四五六七八九十\d]+\s*[（(]?\s*25\s*分[^：:]*[）)]?\s*[：:]?\s*/, '').trim();
  if (stripped && !/^试题/.test(stripped) && stripped.length > 2) return stripped.replace(/（\s*25\s*分[^）]*）/g, '').trim();
  const about = `${question?.title || ''}\n${question?.material || ''}`.match(/关于([^的\n]{2,40})的/)?.[1];
  return about || question?.title || '未命名案例';
}

export function classifyCase(question) {
  const about = `${question?.title || ''}\n${question?.material || ''}`.match(/关于([^的\n]{2,40})的/)?.[1] || '';
  const titleHay = `${question?.title || ''} ${about}`;
  return matchTopic(titleHay, CASE_TOPICS)
    || matchTopic(String(question?.material || '').slice(0, 400), CASE_TOPICS)
    || OTHER;
}

export function parseEssays(content, year) {
  return [...String(content || '').replace(/\r\n?/g, '\n').matchAll(/^## 试题[一二三四五六七八九十\d]+[：:]\s*(.+)$/mg)]
    .map((match, index) => ({
      id: `${year}-essay-${index + 1}`,
      year,
      num: index + 1,
      title: match[1].trim(),
      sourcePath: `zhenti/${year}/论文.md`,
    }));
}

export function loadEssays(root) {
  const dir = path.join(root, 'zhenti');
  let years;
  try { years = readdirSync(dir); } catch { return []; }
  return years.flatMap(year => {
    const file = path.join(dir, year, '论文.md');
    return existsSync(file) ? parseEssays(readFileSync(file, 'utf8'), year) : [];
  });
}

export function classifyEssay(essay) {
  return matchTopic(essay?.title || '', ESSAY_TOPICS) || OTHER;
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function latestAttemptByQuestion(attempts) {
  const latest = new Map();
  for (const item of attempts || []) {
    if (!item?.questionId) continue;
    latest.set(item.questionId, item);
  }
  return latest;
}

function attachMastery(topics, idsByTopic, attempts) {
  const latest = latestAttemptByQuestion(attempts);
  for (const topic of topics) {
    const ids = idsByTopic.get(topic.id) || [];
    let attempted = 0;
    let correct = 0;
    for (const id of ids) {
      const row = latest.get(id);
      if (!row) continue;
      attempted += 1;
      if (row.correct) correct += 1;
    }
    topic.mastery = attempted ? { attempted, correct, accuracy: Math.round(correct / attempted * 100) } : null;
    const gap = attempted ? 1 - correct / attempted : 0.7;
    topic.roi = round1((topic.avgPointsPerPaper || 0) * gap);
  }
}

function bandForAvg(avg) {
  if (avg >= 10) return '高产出';
  if (avg >= 5) return '中等';
  return '低产出';
}

function bandForRate(rate) {
  if (rate >= 0.75) return '必考';
  if (rate >= 0.4) return '高频';
  return '偶发';
}

function sittingsAfter(lastYear, years) {
  if (!lastYear) return years.length;
  const last = yearSortKey(lastYear);
  return years.filter(year => yearSortKey(year) > last).length;
}

function essayAdvice(topic, years) {
  const last = topic.years[topic.years.length - 1];
  const gap = sittingsAfter(last, years);
  if (gap <= 1) return { tag: '刚考过', hint: '近期原题重复概率偏低，不宜作为唯一押题。' };
  if (topic.count >= 2) return { tag: '常考方向', hint: '可变形再考，建议准备一套可迁移素材。' };
  if (gap >= 3) return { tag: '间隔较久', hint: '可作为 2026 备选方向之一。' };
  return { tag: '备选', hint: '出现次数不多，适合作为第三准备方向。' };
}

function emptySubject(scoring, years) {
  return {
    paperCount: years.length,
    paperScore: scoring.paperScore,
    topics: [],
    questionCount: 0,
  };
}

function buildComprehensive(questions, years, attempts) {
  const scoring = EXAM_SCORING.comprehensive;
  const paperCount = Math.max(1, years.length);
  const grouped = new Map();
  const idsByTopic = new Map();
  for (const question of questions) {
    const topic = classifyComprehensive(question);
    const row = grouped.get(topic.id) || { id: topic.id, name: topic.name, count: 0, byYear: new Map() };
    row.count += 1;
    row.byYear.set(question.year, (row.byYear.get(question.year) || 0) + scoring.itemScore);
    grouped.set(topic.id, row);
    const ids = idsByTopic.get(topic.id) || [];
    ids.push(question.id);
    idsByTopic.set(topic.id, ids);
  }
  const topics = [...grouped.values()].map(row => {
    const avgPointsPerPaper = round1(row.count / paperCount);
    return {
      id: row.id,
      name: row.name,
      count: row.count,
      points: row.count * scoring.itemScore,
      avgPointsPerPaper,
      share: round1(avgPointsPerPaper / scoring.paperScore * 100),
      band: bandForAvg(avgPointsPerPaper),
      years: Object.fromEntries(sortYears([...row.byYear.keys()]).map(year => [year, row.byYear.get(year)])),
    };
  }).sort((a, b) => {
    if (a.id === 'other') return 1;
    if (b.id === 'other') return -1;
    return b.avgPointsPerPaper - a.avgPointsPerPaper || b.count - a.count;
  });
  attachMastery(topics, idsByTopic, attempts);
  return {
    paperCount,
    paperScore: scoring.paperScore,
    itemScore: scoring.itemScore,
    questionCount: questions.length,
    note: scoring.note,
    topics,
    focus: topics.filter(topic => topic.id !== 'other').slice(0, 5),
  };
}

function buildCases(cases, years) {
  const scoring = EXAM_SCORING.case;
  const paperCount = Math.max(1, years.length);
  const grouped = new Map();
  for (const question of cases) {
    const topic = classifyCase(question);
    const row = grouped.get(topic.id) || { id: topic.id, name: topic.name, items: [] };
    row.items.push({
      year: question.year,
      num: question.num,
      title: caseDisplayTitle(question),
      points: scoring.itemScore,
    });
    grouped.set(topic.id, row);
  }
  const topics = [...grouped.values()].map(row => {
    const appearedYears = sortYears(row.items.map(item => item.year));
    const uniqueYears = [...new Set(appearedYears)];
    const appearanceRate = uniqueYears.length / paperCount;
    return {
      id: row.id,
      name: row.name,
      count: row.items.length,
      pointsIfChosen: scoring.itemScore,
      appearanceRate: round1(appearanceRate * 100),
      expectedValue: round1(appearanceRate * scoring.itemScore),
      band: bandForRate(appearanceRate),
      years: uniqueYears,
      examples: row.items.slice(-3).map(item => `${item.year} 试题${item.num} ${item.title}`),
    };
  }).sort((a, b) => {
    if (a.id === 'other') return 1;
    if (b.id === 'other') return -1;
    return b.appearanceRate - a.appearanceRate || b.count - a.count;
  });
  return {
    paperCount,
    paperScore: scoring.paperScore,
    itemScore: scoring.itemScore,
    choose: scoring.choose,
    available: scoring.available,
    requiredFirst: scoring.requiredFirst,
    questionCount: cases.length,
    note: scoring.note,
    topics,
    focus: topics.filter(topic => topic.band === '必考' || topic.band === '高频'),
  };
}

function buildEssays(essays, years) {
  const scoring = EXAM_SCORING.essay;
  const paperCount = Math.max(1, years.length);
  const grouped = new Map();
  for (const essay of essays) {
    const topic = classifyEssay(essay);
    const row = grouped.get(topic.id) || { id: topic.id, name: topic.name, items: [] };
    row.items.push({ year: essay.year, num: essay.num, title: essay.title });
    grouped.set(topic.id, row);
  }
  const topics = [...grouped.values()].map(row => {
    const appearedYears = sortYears(row.items.map(item => item.year));
    const uniqueYears = [...new Set(appearedYears)];
    const topic = {
      id: row.id,
      name: row.name,
      count: row.items.length,
      pointsIfChosen: scoring.itemScore,
      years: uniqueYears,
      lastYear: uniqueYears[uniqueYears.length - 1] || null,
      examples: row.items.slice(-3).map(item => `${item.year} ${item.title}`),
    };
    return { ...topic, advice: essayAdvice(topic, years) };
  }).sort((a, b) => {
    if (a.id === 'other') return 1;
    if (b.id === 'other') return -1;
    const gapA = sittingsAfter(a.lastYear, years);
    const gapB = sittingsAfter(b.lastYear, years);
    return gapB - gapA || b.count - a.count;
  });
  return {
    paperCount,
    paperScore: scoring.paperScore,
    itemScore: scoring.itemScore,
    choose: scoring.choose,
    available: scoring.available,
    questionCount: essays.length,
    note: scoring.note,
    topics,
    focus: topics.filter(topic => topic.advice.tag === '间隔较久' || topic.advice.tag === '常考方向').slice(0, 5),
  };
}

function filterByYears(items, years) {
  const set = new Set(years);
  return items.filter(item => set.has(item.year));
}

export function readWebOverlay(root) {
  const file = path.join(root, WEB_OVERLAY_FILE);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function agreementFor(localAvg, min, max) {
  if (localAvg == null || min == null || max == null) return '未对照';
  if (localAvg >= min - 0.5 && localAvg <= max + 0.5) return '对齐';
  if (localAvg < min) return localAvg >= min * 0.7 ? '略低于机构下限' : '低于机构估算';
  return '高于机构估算';
}

function attachWebToComprehensive(topics, overlay) {
  const estimates = overlay?.chapterWeights?.comprehensive;
  if (!Array.isArray(estimates) || !topics?.length) return;
  const byId = new Map(topics.map(topic => [topic.id, topic]));
  for (const estimate of estimates) {
    const localIds = estimate.localIds || [];
    const combined = round1(localIds.reduce((sum, id) => sum + (byId.get(id)?.avgPointsPerPaper || 0), 0));
    const agreement = agreementFor(combined, estimate.pointsMin, estimate.pointsMax);
    for (const id of localIds) {
      const topic = byId.get(id);
      if (!topic) continue;
      topic.web = {
        name: estimate.name,
        pointsMin: estimate.pointsMin,
        pointsMax: estimate.pointsMax,
        share: estimate.share,
        priority: estimate.priority,
        combinedLocal: combined,
        combinedIds: localIds,
        agreement,
      };
    }
  }
}

function compactSources(overlay) {
  return (overlay.sources || []).map(source => ({
    id: source.id,
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    published: source.published,
    tier: source.tier,
  }));
}

function buildVerification(overlay) {
  if (!overlay) return null;
  return {
    retrievedDate: overlay.retrieved_date,
    official: {
      duration: overlay.official?.duration?.note || '',
      passRule: overlay.official?.passRule?.rule || '',
      impliedPassScore: overlay.official?.passRule?.impliedPassScore ?? 45,
      paperScoreNote: overlay.official?.passRule?.paperScoreNote || '',
    },
    chapterWeights: {
      tier: overlay.chapterWeights?.tier || '培训机构估算',
      independence: overlay.chapterWeights?.independence || '',
      case: overlay.chapterWeights?.case || [],
      essay: overlay.chapterWeights?.essay || [],
    },
    conflicts: overlay.conflicts || [],
    latestSitting: overlay.latestSitting || null,
    sources: compactSources(overlay),
  };
}

function buildWindow(questions, cases, essays, years, attempts) {
  return {
    years,
    comprehensive: years.length ? buildComprehensive(filterByYears(questions, years), years, attempts) : emptySubject(EXAM_SCORING.comprehensive, years),
    case: years.length ? buildCases(filterByYears(cases, years), years) : emptySubject(EXAM_SCORING.case, years),
    essay: years.length ? buildEssays(filterByYears(essays, years), years) : emptySubject(EXAM_SCORING.essay, years),
  };
}

export function buildExamPoints({ questions, cases, essays, attempts = [], web = null }) {
  const years = sortYears([
    ...questions.map(item => item.year),
    ...cases.map(item => item.year),
    ...essays.map(item => item.year),
  ]);
  const recentYears = years.slice(-5);
  const recent = buildWindow(questions, cases, essays, recentYears, attempts);
  const all = buildWindow(questions, cases, essays, years, attempts);
  if (web) {
    attachWebToComprehensive(recent.comprehensive.topics, web);
    attachWebToComprehensive(all.comprehensive.topics, web);
  }
  const verification = buildVerification(web);
  return {
    meta: {
      source: 'zhenti/ 2020-2025 历年真题 + 网上多源核对',
      sourceNote: '本地 2022 年起为考生回忆版，不是官方原卷。分类由题干关键词映射到考纲主题。章节分值对照培训机构估算，官方未公布章节细则。',
      scoringNote: verification
        ? '官方已核：各科及格为试卷满分的 60%。章节分值是培训机构估算对照本地真题，不是官方细则。'
        : '三科均需达到及格线（通常 45 分）才算通过。下列分值按历年卷面结构估算，不是官方 2026 评分细则。',
      years,
      recentYears,
      webRetrieved: verification?.retrievedDate || null,
    },
    scoring: EXAM_SCORING,
    verification,
    recent,
    all,
  };
}

export function loadExamPoints(root, attempts = []) {
  return buildExamPoints({
    questions: loadAllQuestions().filter(question => question.subject === '综合知识'),
    cases: loadCases(root),
    essays: loadEssays(root),
    attempts,
    web: readWebOverlay(root),
  });
}

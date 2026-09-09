import React, { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, PieChart } from 'lucide-react';

const SUBJECTS = [
  ['comprehensive', '客观题'],
  ['case', '案例分析'],
  ['essay', '论文'],
];

function bandClass(band) {
  if (band === '高产出' || band === '必考' || band === '间隔较久' || band === '对齐') return 'hot';
  if (band === '中等' || band === '高频' || band === '常考方向' || band === '略低于机构下限') return 'mid';
  return 'low';
}

function pointsLabel(subject, topic) {
  if (subject === 'comprehensive') return `每卷约 ${topic.avgPointsPerPaper} 分`;
  if (subject === 'case') return `选中可得 ${topic.pointsIfChosen} 分 · 出现率 ${topic.appearanceRate}%`;
  return `选中可得 ${topic.pointsIfChosen} 分 · 上次 ${topic.lastYear || '—'}`;
}

function barWidth(subject, topic) {
  if (subject === 'comprehensive') return Math.min(100, Number(topic.share || 0) * (100 / 28));
  if (subject === 'case') return Math.min(100, Number(topic.appearanceRate || 0));
  return Math.min(100, Number(topic.count || 0) / 4 * 100);
}

function TopicCard({ subject, topic, open, onToggle }) {
  const bar = barWidth(subject, topic);
  return <article className={`ep-topic ${open ? 'open' : ''}`}>
    <button type="button" onClick={onToggle}>
      <div className="ep-topic-top">
        <b>{topic.name}</b>
        <span className={`ep-band ${bandClass(topic.band || topic.advice?.tag)}`}>{topic.band || topic.advice?.tag}</span>
      </div>
      <p>{pointsLabel(subject, topic)}</p>
      <i><em style={{ width: `${Math.max(8, bar)}%` }}/></i>
      {topic.web && <small>机构估算 {topic.web.pointsMin}–{topic.web.pointsMax} 分 · 本地合计 {topic.web.combinedLocal} 分 · {topic.web.agreement}</small>}
      {topic.mastery && <small>你已练 {topic.mastery.attempted} 题 · 正确率 {topic.mastery.accuracy}%</small>}
      {!topic.mastery && subject === 'comprehensive' && <small>还没练过这个考点</small>}
      {topic.advice?.hint && <small>{topic.advice.hint}</small>}
    </button>
    {open && <div className="ep-topic-detail">
      {subject === 'comprehensive' && <p>累计 {topic.count} 题 · 约占卷面 {topic.share}%</p>}
      {topic.web && topic.web.combinedIds?.length > 1 && <p>希赛把「{topic.web.name}」合在一起估分，对照本地 {topic.web.combinedIds.join(' + ')}。</p>}
      {topic.years && !Array.isArray(topic.years) && <p>各年分值：{Object.entries(topic.years).map(([year, points]) => `${year} ${points}分`).join(' · ')}</p>}
      {Array.isArray(topic.years) && topic.years.length > 0 && <p>出现年份：{topic.years.join('、')}</p>}
      {topic.examples?.length > 0 && <ul>{topic.examples.map(item => <li key={item}>{item}</li>)}</ul>}
    </div>}
  </article>;
}

function VerifyPanel({ verification }) {
  if (!verification) return null;
  const latest = verification.latestSitting;
  return <section className="ep-verify">
    <div className="ep-chips">
      <span className="ok">官方已核 · 60%及格</span>
      <span className="mid">机构估算 · 章节分值</span>
      <span className="warn">冲突 {verification.conflicts.length} 条</span>
    </div>
    <p>检索日期 {verification.retrievedDate}。{verification.official.passRule}。{verification.official.paperScoreNote}</p>
    {verification.official.duration && <p>{verification.official.duration}</p>}
    {verification.conflicts.map(item => <article key={item.id} className="ep-conflict">
      <b>{item.topic}</b>
      {item.adopt && <p>采用：{item.adopt}</p>}
      {item.adopt && item.claimB && <p>不采用：{item.claimB}</p>}
      {!item.adopt && item.claimA && <p>旧说法：{item.claimA}</p>}
      <p>{item.resolution}</p>
    </article>)}
    {latest && <article className="ep-latest">
      <span>LATEST SITTING</span>
      <h3>{latest.year} 考生回忆 · {latest.examDate}</h3>
      <p>{latest.tier}。本地 zhenti/ 还没有这一场。</p>
      <p>案例必做：{latest.case?.required}</p>
      {latest.case?.optional?.length > 0 && <p>选做：{latest.case.optional.join(' · ')}</p>}
      {latest.essay?.length > 0 && <p>论文：{latest.essay.join(' · ')}</p>}
    </article>}
  </section>;
}

export default function ExamPointsPage({ go, api }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [windowKey, setWindow] = useState('recent');
  const [subject, setSubject] = useState('comprehensive');
  const [openId, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    api('/api/exam-points').then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '考点分布加载失败');
      if (alive) { setData(payload); setError(''); }
    }).catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [api]);

  const view = data?.[windowKey];
  const block = view?.[subject];
  const orgHints = subject === 'case'
    ? data?.verification?.chapterWeights?.case
    : subject === 'essay'
      ? data?.verification?.chapterWeights?.essay
      : null;

  return <div className="page exam-points-page">
    <header className="topbar">
      <button className="icon-btn" onClick={() => go('home')} aria-label="返回首页"><ArrowLeft size={22}/></button>
      <div className="top-title">考点分布</div>
      <button className="icon-btn" aria-hidden><PieChart size={18}/></button>
    </header>
    <section className="ep-hero">
      <span>SCORE MAP</span>
      <h1>按分值找投入产出比</h1>
      <p>{data?.meta?.scoringNote || '先看最近几年真正占分的考点，再决定今晚补哪一块。'}</p>
    </section>
    {data && <div className="ep-stats">
      <div><b>{(windowKey === 'recent' ? data.meta.recentYears : data.meta.years).length}</b><small>次考试</small></div>
      <div><b>{block?.questionCount || 0}</b><small>{subject === 'comprehensive' ? '客观题' : subject === 'case' ? '案例题' : '论文题'}</small></div>
      <div><b>75</b><small>卷面满分</small></div>
    </div>}
    {data?.verification && <VerifyPanel verification={data.verification}/>}
    <div className="filter-row">
      <button className={windowKey === 'recent' ? 'active' : ''} onClick={() => { setWindow('recent'); setOpen(null); }}>近 5 次</button>
      <button className={windowKey === 'all' ? 'active' : ''} onClick={() => { setWindow('all'); setOpen(null); }}>2020–2025</button>
    </div>
    <div className="filter-row subject-tabs">
      {SUBJECTS.map(([id, label]) => <button key={id} className={subject === id ? 'active' : ''} onClick={() => { setSubject(id); setOpen(null); }}>{label}</button>)}
    </div>
    {error && <div className="knowledge-error">{error}</div>}
    {!data && !error && <p className="ep-loading">正在统计历年真题…</p>}
    {block && <p className="ep-note">{block.note}</p>}
    {orgHints?.length > 0 && <p className="ep-note">{data.verification.chapterWeights.tier}：{orgHints.map(item => `${item.name} ${item.frequency}`).join('；')}。</p>}
    {block?.focus?.length > 0 && <section className="ep-focus">
      <div className="plan-title-row"><div><span className="plan-kicker">FOCUS FIRST</span><h3>优先投入</h3></div></div>
      <div className="ep-focus-list">{block.focus.slice(0, 4).map(topic => <div key={topic.id}><b>{topic.name}</b><small>{pointsLabel(subject, topic)}</small></div>)}</div>
    </section>}
    {block && <section className="ep-list">
      {block.topics.map(topic => <TopicCard
        key={topic.id}
        subject={subject}
        topic={topic}
        open={openId === topic.id}
        onToggle={() => setOpen(openId === topic.id ? null : topic.id)}
      />)}
    </section>}
    {data && <p className="ep-source">{data.meta.source}。{data.meta.sourceNote}{data.meta.webRetrieved ? ` 网上核对 ${data.meta.webRetrieved}。` : ''}</p>}
    {data?.verification?.sources?.length > 0 && <ul className="ep-sources">
      {data.verification.sources.map(source => <li key={source.id}><span>{source.tier}</span> {source.publisher} · {source.title}</li>)}
    </ul>}
    <button className="ep-practice" onClick={() => go('practice')}><BookOpen size={15}/> 去刷对应真题 <ChevronRight size={14}/></button>
  </div>;
}

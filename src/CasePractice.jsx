import React, { useEffect, useState } from 'react';

function latestFor(history) {
  return history.length ? history[history.length - 1] : null;
}
function isLegacy(attempt) {
  return Boolean(attempt?.feedback) && !attempt?.partGrades;
}
function partDone(attempt, partId) {
  return Boolean(String(attempt?.answers?.[partId] || '').trim());
}
function progressMark(question, attempts) {
  const latest = attempts.filter(a => a.questionId === question.id).at(-1);
  if (!latest) return '';
  const n = question.parts.filter(p => partDone(latest, p.id)).length;
  if (!n) return '';
  return n >= question.parts.length ? ' ✓' : ` ${n}/${question.parts.length}`;
}

export default function CasePractice({ api, Markdown, onSaved }) {
  const [year, setYear] = useState(() => localStorage.getItem('rk_case_year') || '2025下');
  const [data, setData] = useState(null), [index, setIndex] = useState(0), [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setData(null); setError(''); setIndex(0);
    localStorage.setItem('rk_case_year', year);
    api(`/api/cases?year=${encodeURIComponent(year)}`).then(async r => {
      const d = await r.json(); if (!r.ok) throw new Error(d.error || '加载失败');
      if (alive) setData(d);
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [year]);
  const question = data?.questions[index];
  return <div className="page case-page"><h2>案例分析</h2>
    <div className="filter-row"><select aria-label="案例年份" value={year} onChange={e => setYear(e.target.value)}>{(data?.years || [year]).map(y => <option key={y}>{y}</option>)}</select></div>
    {error && <p role="alert">{error}</p>}{!data && !error && <p>正在加载案例…</p>}
    {data && <div className="filter-row">{data.questions.map((q, i) => <button key={q.id} className={index === i ? 'active' : ''} onClick={() => setIndex(i)}>第 {q.num} 题{progressMark(q, data.attempts)}</button>)}</div>}
    {data && !question && <p>该年份暂无案例题。</p>}
    {question && <CaseAnswer key={question.id} question={question} api={api} Markdown={Markdown} history={data.attempts.filter(a => a.questionId === question.id)} onSaved={attempt => {
      setData(d => d && attempt.year === year ? ({ ...d, attempts: [...d.attempts.filter(a => a.id !== attempt.id), attempt] }) : d); onSaved();
    }}/>}
  </div>;
}

function CaseAnswer({ question: q, api, Markdown, history, onSaved }) {
  const key = `rk_case_draft_${q.id}`;
  const initial = latestFor(history);
  const [attempt, setAttempt] = useState(initial);
  const [fresh, setFresh] = useState(false);
  const [answers, setAnswers] = useState(() => {
    let draft = {};
    try { draft = JSON.parse(localStorage.getItem(key)) || {}; } catch { /* ignore */ }
    return { ...draft, ...(initial?.answers || {}) };
  });
  const [partRefs, setPartRefs] = useState(() => ({ ...(initial?.partReferences || {}) }));
  const [busyPart, setBusyPart] = useState('');
  const [errors, setErrors] = useState({});
  useEffect(() => {
    const draft = { ...answers };
    for (const id of Object.keys(attempt?.answers || {})) if (partDone(attempt, id)) delete draft[id];
    localStorage.setItem(key, JSON.stringify(draft));
  }, [answers, key, attempt]);
  const request = async (url, body) => {
    const r = await api(url, { method: 'POST', body: JSON.stringify(body) });
    const d = await r.json();
    return { ok: r.ok, status: r.status, data: d };
  };
  const locked = p => partDone(attempt, p.id) || isLegacy(attempt) || busyPart === p.id;
  const doneCount = q.parts.filter(p => partDone(attempt, p.id)).length;
  const submitPart = async partId => {
    if (busyPart || !answers[partId]?.trim()) return;
    setBusyPart(partId);
    setErrors(e => ({ ...e, [partId]: '' }));
    try {
      const body = { questionId: q.id, partId, answer: answers[partId] };
      if (!fresh && attempt?.id && !isLegacy(attempt)) body.attemptId = attempt.id;
      const { ok, status, data } = await request('/api/cases/attempts', body);
      if (!ok && status !== 409) throw new Error(data.error || '提交失败');
      const record = data.attempt;
      setAttempt(record);
      setFresh(false);
      if (data.reference != null) setPartRefs(r => ({ ...r, [partId]: data.reference }));
      onSaved(record);
      if (record.partGrades?.[partId]?.feedback) return;
      const graded = await request(`/api/cases/attempts/${record.id}/grade`, { partId });
      if (!graded.ok) throw new Error(graded.data.error || '批改失败');
      setAttempt(graded.data.attempt);
      onSaved(graded.data.attempt);
    } catch (e) {
      setErrors(err => ({ ...err, [partId]: e.message }));
    } finally {
      setBusyPart('');
    }
  };
  const gradePart = async (record, partId) => {
    setBusyPart(partId);
    setErrors(e => ({ ...e, [partId]: '' }));
    try {
      const { ok, data } = await request(`/api/cases/attempts/${record.id}/grade`, { partId });
      if (!ok) throw new Error(data.error || '批改失败');
      setAttempt(data.attempt);
      onSaved(data.attempt);
    } catch (e) {
      setErrors(err => ({ ...err, [partId]: e.message }));
    } finally {
      setBusyPart('');
    }
  };
  const reset = () => {
    setAttempt(null); setFresh(true); setPartRefs({}); setAnswers({}); setErrors({});
    localStorage.removeItem(key);
  };
  return <>
    <h3>{q.title}</h3><p className="case-source">{q.source} · {q.sourcePath}</p>
    <p>按小问提交、当场批改。未提交的小问不露答案、不计零分。参考答案非官方，AI 批改为估算评分；材料缺失的小问不计入可评满分。</p>
    <p className="case-progress">已完成 {doneCount} / {q.parts.length} 小问 · 可随时离开，下次接着做</p>
    <Markdown content={q.material}/>
    {q.parts.map(p => {
      const submitted = partDone(attempt, p.id);
      const grade = attempt?.partGrades?.[p.id];
      const reference = partRefs[p.id] ?? attempt?.partReferences?.[p.id];
      return <section className="case-part" key={p.id}>
        <h3>{p.title}</h3>
        <Markdown content={p.text}/>
        <textarea aria-label={`${p.title}作答`} rows={7} maxLength={6000} placeholder="填写这一问（草稿自动保存在本机）" value={answers[p.id] || ''} disabled={locked(p)} onChange={e => setAnswers(a => ({ ...a, [p.id]: e.target.value }))}/>
        {errors[p.id] && <p role="alert" className="follow-up-error">{errors[p.id]}</p>}
        {!submitted && !isLegacy(attempt) && <button className="case-submit" disabled={Boolean(busyPart) || !answers[p.id]?.trim()} onClick={() => submitPart(p.id)}>{busyPart === p.id ? '正在保存并批改…' : '提交本问并批改'}</button>}
        {submitted && !grade?.feedback && !isLegacy(attempt) && <button className="case-submit" disabled={Boolean(busyPart)} onClick={() => gradePart(attempt, p.id)}>{busyPart === p.id ? '正在批改…' : '重新批改本问'}</button>}
        {(grade?.feedback || reference) && <div className="case-part-feedback">
          {busyPart === p.id && !grade?.feedback && <p>作答已保存，正在批改…</p>}
          {grade?.feedback && <Markdown content={grade.feedback}/>}
          {reference ? <details><summary>查看本问非官方参考答案</summary><Markdown content={reference}/></details> : submitted && <p className="case-source">本题该小问暂无非官方参考答案。</p>}
        </div>}
      </section>;
    })}
    {isLegacy(attempt) && <section className="explain">
      <h3>历史整题作答</h3>
      {errors.legacy && <p role="alert" className="follow-up-error">{errors.legacy}</p>}
      {attempt.feedback ? <Markdown content={attempt.feedback}/> : <button disabled={Boolean(busyPart)} onClick={async () => {
        setBusyPart('legacy');
        try {
          const { ok, data } = await request(`/api/cases/attempts/${attempt.id}/grade`, {});
          if (!ok) throw new Error(data.error || '批改失败');
          setAttempt(data.attempt); onSaved(data.attempt);
        } catch (e) { setErrors({ legacy: e.message }); } finally { setBusyPart(''); }
      }}>继续整题批改</button>}
    </section>}
    {(attempt || doneCount > 0) && <button className="case-reset" disabled={Boolean(busyPart)} onClick={reset}>重新练习本题</button>}
    {!!history.length && <details className="case-history"><summary>历史作答（{history.length} 次）</summary>{[...history].reverse().map(a => <article key={a.id}>
      <h4>{new Date(a.answeredAt).toLocaleString('zh-CN')} · {a.status === 'graded' || a.feedback ? '已批改' : a.status === 'in_progress' ? '进行中' : '待批改'}</h4>
      {q.parts.map(p => <div key={p.id}><b>{p.title}</b><p style={{ whiteSpace: 'pre-wrap' }}>{a.answers?.[p.id]?.trim() ? a.answers[p.id] : '未作答'}</p>
        {a.partGrades?.[p.id]?.feedback && <Markdown content={a.partGrades[p.id].feedback}/>}
        {a.answers?.[p.id]?.trim() && !a.partGrades?.[p.id]?.feedback && !isLegacy(a) && <button disabled={Boolean(busyPart)} onClick={() => { setAttempt(a); setFresh(false); gradePart(a, p.id); }}>继续批改{p.title}</button>}
      </div>)}
      {isLegacy(a) && (a.feedback ? <Markdown content={a.feedback}/> : <button disabled={Boolean(busyPart)} onClick={() => { setAttempt(a); setAnswers(a.answers); }}>查看后继续整题批改</button>)}
    </article>)}</details>}
  </>;
}

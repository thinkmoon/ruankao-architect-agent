import React, { useEffect, useState } from 'react';

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
    {data && <div className="filter-row">{data.questions.map((q, i) => <button key={q.id} className={index === i ? 'active' : ''} onClick={() => setIndex(i)}>第 {q.num} 题{data.attempts.some(a => a.questionId === q.id) ? ' ✓' : ''}</button>)}</div>}
    {data && !question && <p>该年份暂无案例题。</p>}
    {question && <CaseAnswer key={question.id} question={question} api={api} Markdown={Markdown} history={data.attempts.filter(a => a.questionId === question.id)} onSaved={attempt => {
      setData(d => d && attempt.year === year ? ({ ...d, attempts: [...d.attempts.filter(a => a.id !== attempt.id), attempt] }) : d); onSaved();
    }}/>}
  </div>;
}
function CaseAnswer({ question: q, api, Markdown, history, onSaved }) {
  const key = `rk_case_draft_${q.id}`;
  const [answers, setAnswers] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } });
  const [attempt, setAttempt] = useState(null), [reference, setReference] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { localStorage.setItem(key, JSON.stringify(answers)); }, [answers, key]);
  const request = async (url, body) => {
    const r = await api(url, { method: 'POST', body: JSON.stringify(body) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || '请求失败'); return d;
  };
  const grade = async record => {
    setBusy(true); setError('');
    try { const d = await request(`/api/cases/attempts/${record.id}/grade`, {}); setAttempt(d.attempt); onSaved(d.attempt); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const d = await request('/api/cases/attempts', { questionId: q.id, answers: Object.fromEntries(q.parts.map(p => [p.id, answers[p.id] || ''])) });
      setAttempt(d.attempt); setReference(d.reference); onSaved(d.attempt); await grade(d.attempt);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <>
    <h3>{q.title}</h3><p className="case-source">{q.source} · {q.sourcePath}</p>
    <p>参考答案非官方，AI 批改为估算评分。未作答小问计零分；材料缺失的小问不计入可评满分。</p>
    <Markdown content={q.material}/>
    {q.parts.map(p => <section className="case-part" key={p.id}><h3>{p.title}</h3><Markdown content={p.text}/><textarea aria-label={`${p.title}作答`} rows={7} maxLength={6000} placeholder="填写你的答案（草稿自动保存在本机）" value={answers[p.id] || ''} disabled={busy || !!attempt} onChange={e => setAnswers(a => ({ ...a, [p.id]: e.target.value }))}/></section>)}
    {error && <p role="alert" className="follow-up-error">{error}</p>}
    {!attempt && <button className="case-submit" disabled={busy || !q.parts.some(p => answers[p.id]?.trim())} onClick={submit}>{busy ? '正在保存并批改…' : '提交答案并批改'}</button>}
    {attempt && <section className="explain"><h3>{busy ? '作答已保存，正在批改…' : '本次作答已保存'}</h3>{attempt.feedback && <Markdown content={attempt.feedback}/>}{!attempt.feedback && <button disabled={busy} onClick={() => grade(attempt)}>重新批改</button>}{reference && <details><summary>查看非官方参考答案</summary><Markdown content={reference}/></details>}<button disabled={busy} onClick={() => { setAttempt(null); setReference(''); setAnswers({}); }}>重新练习</button></section>}
    {!!history.length && <details className="case-history"><summary>历史作答（{history.length} 次）</summary>{[...history].reverse().map(a => <article key={a.id}><h4>{new Date(a.answeredAt).toLocaleString('zh-CN')} · {a.feedback ? '已批改' : '待批改'}</h4>{Object.entries(a.answers).map(([id, text]) => <div key={id}><b>问题 {id}</b><p style={{ whiteSpace: 'pre-wrap' }}>{text || '未作答'}</p></div>)}{a.feedback ? <Markdown content={a.feedback}/> : <button disabled={busy} onClick={() => { setAnswers(a.answers); setAttempt(a); grade(a); }}>继续批改</button>}</article>)}</details>}
  </>;
}

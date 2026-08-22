import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Area, AreaChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, Bookmark, BookmarkCheck, Bot, Calendar, Camera, Check, ChevronRight, CircleUserRound, Clock3, Flame, Home, ImagePlus, Lightbulb, MessageCircle, MoreHorizontal, RotateCcw, Send, Sparkles, Target, Trophy, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './styles.css';
import './plan-overrides.css';
import './acp.css';

const EMPTY_STATS = { totalDone: 0, mistakeCount: 0, recentAccuracy: 0, studyDays: 0, trend: [], masteryByTopic: [], studyMinutes: 0, today: {}, reviewPlan: null };
const DAILY_GOAL = 20;
const ACCESS_TOKEN_KEY = 'rk_acp_token';

function getStoredToken() {
  return new URLSearchParams(location.search).get('token') || localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

// Token 无效时由 App 显示阻断式输入页，避免把鉴权失败误显示成“没有真题”。
async function checkAccessToken(token) {
  const response = await fetch('/api/years', { headers: token ? { 'X-API-Token': token } : {} });
  if (!response.ok) localStorage.removeItem(ACCESS_TOKEN_KEY);
  return response.ok;
}

function api(path, options = {}) {
  const token = getStoredToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['X-API-Token'] = token;
  if (options.body) headers['Content-Type'] = 'application/json';
  return fetch(path, { ...options, headers });
}

function Header({ title, back, onBack, action }) {
  return <header className="topbar">{back ? <button className="icon-btn" onClick={onBack}><ArrowLeft size={22}/></button> : <div className="brand-mark"><span>R</span></div>}<div className="top-title">{title}</div>{action || <button className="icon-btn"><MoreHorizontal size={22}/></button>}</header>;
}

function HomePage({ go, stats }) {
  const acc = Math.round(stats.recentAccuracy * 100);
  const weak = [...stats.masteryByTopic].sort((a,b)=>a.value-b.value).slice(0,2);
  const phase = stats.reviewPlan?.phase;
  const today = stats.today || {};
  const todayGoal = stats.reviewPlan?.todayPlan?.tasks?.find(t => t.type === 'questions') ? (stats.reviewPlan.todayPlan.tasks.find(t => t.type === 'questions').target || DAILY_GOAL) : DAILY_GOAL;
  const todayProgress = Math.min(100, Math.round((today.attemptedQuestions || 0) / todayGoal * 100));
  return <div className="page home-page">
    <div className="home-head"><div><p>晚上好，架构师 👋</p><h1>今天也离上岸更近一步</h1></div><button className="avatar"><CircleUserRound size={26}/></button></div>
    <section className="hero-card">
      <div className="hero-copy"><span className="eyebrow"><Flame size={14}/> 连续学习 {stats.studyDays} 天</span><h2>今日学习计划</h2><p>{phase?.name || '备考准备'} · {phase?.dailyFocus || '先完成今天的学习任务'}</p><div className="progress-track"><i style={{width:`${todayProgress}%`}}/></div><small>今日已完成 {today.attemptedQuestions || 0} 题 · 目标 {todayGoal} 题 · 到期复习 {today.dueReviews || 0} 项</small></div>
      <div className="hero-ring"><strong>{todayProgress}</strong><span>%</span></div>
      <button onClick={() => go('practice')} className="hero-action">继续学习 <ArrowRight size={17}/></button>
    </section>
    <div className="quick-grid">
      <button onClick={() => go('practice')}><span className="quick-icon green"><BookOpen/></span><b>真题练习</b><small>历年真题随时刷</small></button>
      <button onClick={() => go('mistakes')}><span className="quick-icon orange"><BookmarkCheck/></span><b>我的错题</b><small>{stats.mistakeCount} 道待巩固</small></button>
      <button onClick={() => go('chat')}><span className="quick-icon purple"><Sparkles/></span><b>AI 答疑</b><small>截图秒懂难题</small></button>
      <button onClick={() => go('plan')}><span className="quick-icon blue"><Target/></span><b>复习计划</b><small>阶段任务与到期复习</small></button>
      <button onClick={() => go('insights')}><span className="quick-icon purple"><BarChart3/></span><b>知识画像</b><small>查看薄弱知识点</small></button>
    </div>
    <div className="section-title"><div><h3>本周学情</h3><p>保持节奏，稳步提升</p></div><button onClick={() => go('insights')}>详情 <ChevronRight size={15}/></button></div>
    <section className="weekly-card">
      <div className="metric"><span><Target size={18}/></span><div><strong>{stats.totalDone}</strong><small>完成题目</small></div></div>
      <div className="metric"><span><Trophy size={18}/></span><div><strong>{stats.totalDone ? acc+'%' : '—'}</strong><small>近20题正确率</small></div></div>
      <div className="metric"><span><Clock3 size={18}/></span><div><strong>{(stats.studyMinutes/60).toFixed(1)}h</strong><small>学习时长</small></div></div>
      <div className="mini-chart">{stats.trend.length>0 && <ResponsiveContainer width="100%" height={72}><AreaChart data={stats.trend}><defs><linearGradient id="mini" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2c7a62" stopOpacity=".35"/><stop offset="1" stopColor="#2c7a62" stopOpacity="0"/></linearGradient></defs><Area type="monotone" dataKey="v" stroke="#2c7a62" strokeWidth={2.5} fill="url(#mini)"/></AreaChart></ResponsiveContainer>}</div>
    </section>
    <div className="section-title"><div><h3>薄弱知识点</h3><p>根据近期答题动态生成</p></div></div>
    {weak.length ? <section className="weak-list">{weak.map(w=><div key={w.subject}><span className="weak-num">{w.subject.slice(0,2)}</span><p><b>{w.subject}</b><small>掌握度 {w.value}% · 建议优先复习</small></p><i><em style={{width:`${w.value}%`}}/></i></div>)}</section>
      : <section className="weak-list"><div><span className="weak-num">--</span><p><b>暂无数据</b><small>完成几道题后自动生成</small></p><i><em style={{width:'0%'}}/></i></div></section>}
  </div>;
}

function PracticeCalendar({ stats }) {
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const activity = new Map((stats.calendar || []).map(item => [item.date, item]));
  const cells = [...Array(first).fill(null), ...Array.from({length: days}, (_, i) => i + 1)];
  const key = day => `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return <section className="practice-calendar"><div className="calendar-head"><div><span className="plan-kicker">CHECK-IN CALENDAR</span><h3>刷题打卡</h3></div><div className="calendar-nav"><button onClick={() => setCursor(new Date(year, month - 1, 1))}><ArrowLeft size={15}/></button><b>{year}年{month + 1}月</b><button onClick={() => setCursor(new Date(year, month + 1, 1))}><ArrowRight size={15}/></button></div></div><div className="calendar-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div className="calendar-grid">{cells.map((day, i) => { const item=day?activity.get(key(day)):null; return <div className={`calendar-day ${day&&item?.questions?'has-practice':''}`} key={i}>{day&&<><b>{day}</b>{item?.questions>0&&<small>{item.questions}题</small>}</>}</div>})}</div><div className="calendar-summary"><span><i className="dot-practice"/>刷题日</span><span>{[...activity.values()].filter(item=>item.date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)&&item.questions>0).length} 天有答题</span></div></section>;
}

function ReviewPlanPage({ go, stats, plan }) {
  const today = plan?.stats?.today || stats.today || {};
  const todayPlan = plan?.dailyPlans?.[today.date] || stats.reviewPlan?.todayPlan;
  const phase = plan?.phases?.find(item => item.id === todayPlan?.phaseId) || stats.reviewPlan?.phase;
  const due = (plan?.mistakeQueue || []).filter(item => item.status !== 'mastered' && item.nextReviewAt <= today.date);
  const tasks = todayPlan?.tasks || [];
  const done = tasks.filter(item => item.status === 'completed').length;
  const dayProgress = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const phaseGoal = phase?.progress?.[0];
  const phaseProgress = phaseGoal ? Math.min(100, Math.round(phaseGoal.actual / Math.max(1, phaseGoal.target) * 100)) : 0;
  const taskIcon = type => type === 'review' ? <RotateCcw size={19}/> : type === 'questions' ? <BookOpen size={19}/> : <Sparkles size={19}/>;
  return <div className="page plan-page">
    <header className="plan-head"><button className="plan-back" onClick={() => go('home')}><ArrowLeft size={21}/></button><div><span>STUDY ROADMAP</span><h1>复习计划</h1></div><button className="plan-calendar"><Calendar size={20}/></button></header>
    <section className="plan-hero">
      <div className="plan-hero-top"><span className="phase-tag"><Flame size={13}/> 当前阶段 · 第 {phase?.order || 1} 阶段</span><span className="phase-percent">{phaseProgress}%</span></div>
      <h2>{phase?.name || '备考准备'}</h2><p>{phase?.dailyFocus || phase?.goal || '完成今天的学习任务，保持稳定节奏。'}</p>
      <div className="phase-progress"><i style={{width:`${phaseProgress}%`}}/></div>
      <div className="plan-hero-stats"><div><strong>{today.attemptedQuestions || 0}</strong><small>今日刷题</small></div><div><strong>{today.studyMinutes || 0}<em>m</em></strong><small>今日学习</small></div><div><strong>{due.length}</strong><small>到期复习</small></div></div>
    </section>
    <section className="plan-today">
      <div className="plan-title-row"><div><span className="plan-kicker">TODAY</span><h3>今日任务</h3></div><div className="today-ring" style={{'--progress':`${dayProgress * 3.6}deg`}}><b>{done}/{tasks.length}</b></div></div>
      <div className="task-list">{tasks.map((task,index) => <div key={task.id} className={`task-card ${task.status}`}><span className={`task-icon task-icon-${task.type}`}>{taskIcon(task.type)}</span><span className="task-copy"><small>任务 {String(index+1).padStart(2,'0')}</small><b>{task.title}</b><em><Clock3 size={12}/>{task.estimatedMinutes} 分钟 · {task.status === 'completed' ? '学习记录已达标' : '完成后自动结算'}</em></span><span className="task-state">{task.status === 'completed' ? <Check size={17}/> : <ChevronRight size={17}/>}</span></div>)}</div>
      {!tasks.length && <div className="plan-empty">今天还没有生成学习任务</div>}
    </section>
    <section className="plan-review-card">
      <div className="plan-title-row"><div><span className="plan-kicker orange-text">REVIEW</span><h3>到期错题</h3></div><button onClick={() => go('mistakes')}>查看全部 <ChevronRight size={14}/></button></div>
      {due.length ? <div className="due-list">{due.slice(0,3).map(item => <button key={item.mistakeId} onClick={() => go('mistakes')}><span className="due-priority">{item.priority === 'high' ? '重点' : '复习'}</span><span><b>{item.topic || item.sourceRef}</b><small>{item.sourceRef} · 累计错 {item.wrongCount} 次</small></span><ChevronRight size={16}/></button>)}</div> : <div className="review-clear"><span><Check size={20}/></span><div><b>今日错题已清空</b><small>保持节奏，新的复习会按周期自动出现</small></div></div>}
    </section>
    <section className="roadmap-section"><div className="plan-title-row"><div><span className="plan-kicker">ROADMAP</span><h3>备考路线</h3></div><small>距考试 {plan?.meta?.examDate || '2026-10-24'}</small></div>
      <div className="roadmap-list">{plan?.phases?.map((item,index) => { const active=item.id===phase?.id; const goal=item.progress?.[0]; const pct=goal?Math.min(100,Math.round(goal.actual/Math.max(1,goal.target)*100)):0; return <article className={`${active?'active ':''}${item.status==='completed'?'completed':''}`} key={item.id}><span className="roadmap-index">{item.status==='completed'?<Check size={15}/>:String(index+1).padStart(2,'0')}</span><div><div className="roadmap-name"><b>{item.name}</b><span>{active?'进行中':item.status==='completed'?'已完成':'待解锁'}</span></div><small>{item.startDate.slice(5).replace('-','/')} — {item.endDate.slice(5).replace('-','/')}</small><p>{item.goal}</p>{goal&&<div className="roadmap-progress"><i style={{width:`${pct}%`}}/><em>{goal.actual}/{goal.target}</em></div>}</div></article>})}</div>
    </section>
    <PracticeCalendar stats={stats}/>
  </div>;
}

function YearPicker({ years, year, onChange }) {
  const selRef = useRef();
  const current = years.find(y => y.year === year);
  return <div className="year-picker">
    <button className="year-trigger" onClick={() => selRef.current?.focus?.()}>
      <Calendar size={15}/>{current ? current.label : year} · {current ? current.count + ' 题' : ''}
      <ChevronRight size={15} style={{transform:'rotate(90deg)'}}/>
    </button>
    <select ref={selRef} className="year-select" value={year} onChange={e => onChange(e.target.value)} aria-label="选择年份">
      {years.map(y => <option key={y.year} value={y.year}>{y.label}（{y.count} 题）</option>)}
    </select>
  </div>;
}

function Markdown({ content, className = 'markdown-body' }) {
  if (!content) return null;
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function FollowUpPanel({ question, session, onAsk }) {
  const [draft, setDraft] = useState('');
  const turns = session?.items || [];
  const busy = Boolean(session?.loading);
  const submit = text => {
    const message = String(text ?? draft).trim();
    if (!message || busy) return;
    setDraft('');
    onAsk(question, message, turns);
  };
  return <section className="follow-up">
    <div className="follow-up-head">
      <div className="follow-up-title"><span><MessageCircle size={16}/></span><div><b>继续追问</b><small>不懂的地方，问到明白为止</small></div></div>
      {turns.length > 0 && <span className="follow-up-count">{Math.ceil(turns.length / 2)} 次追问</span>}
    </div>
    {turns.length === 0 && <div className="follow-up-suggestions">
      {['为什么其他选项不对？', '换一种更容易理解的方式', '结合实际项目举个例子'].map(text => <button key={text} onClick={() => submit(text)} disabled={busy}>{text}<ArrowRight size={13}/></button>)}
    </div>}
    {turns.length > 0 && <div className="follow-up-thread">
      {turns.map((turn, i) => turn.role === 'user'
        ? <div className="follow-up-user" key={i}>{turn.content}</div>
        : <div className="follow-up-answer" key={i}><span><Sparkles size={13}/></span>{turn.content ? <Markdown content={turn.content} className="follow-up-markdown"/> : <div className="follow-up-dots"><i/><i/><i/></div>}</div>)}
    </div>}
    {session?.error && <p className="follow-up-error">{session.error}</p>}
    <div className="follow-up-composer">
      <textarea value={draft} maxLength={2000} rows={1} placeholder="例如：这个知识点在项目中怎么用？" disabled={busy} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}/>
      <button className="follow-up-send" aria-label="发送追问" disabled={!draft.trim() || busy} onClick={() => submit()}>{busy ? <span className="follow-up-spinner"/> : <Send size={15}/>}</button>
    </div>
    <small className="follow-up-hint">Enter 发送 · Shift + Enter 换行</small>
  </section>;
}

function PracticePage({ go, questions, loading, years, year, startNum, onConsumedStart, onSelectYear, wrongIds, onAnswered, onToggleMistake, askAi, explainAi, explainFollowUps, askFollowUp }) {
  // 各年份进度记忆：index 按年份持久化
  const [index, setIndex] = useState(() => {
    if (startNum != null) return -1; // 等 questions 加载后定位 startNum
    try { return Math.max(0, JSON.parse(localStorage.getItem('rk_progress_'+year)) || 0); } catch { return 0; }
  });
  const [selected, setSelected] = useState(null), [revealed, setRevealed] = useState(false);
  // 定位「再做一次」的目标题
  useEffect(() => {
    if (startNum == null || !questions.length) return;
    const i = questions.findIndex(q => q.num === startNum);
    setIndex(i >= 0 ? i : 0); setSelected(null); setRevealed(false); onConsumedStart();
  }, [startNum, questions]);
  // 持久化当前题号（直接跳入模式不覆盖）
  useEffect(() => {
    if (index >= 0 && questions.length && startNum == null) {
      try { localStorage.setItem('rk_progress_'+year, JSON.stringify(index)); } catch {}
    }
  }, [index, year, questions.length, startNum]);
  const yearBar = years.length > 0 && <div className="year-bar"><YearPicker years={years} year={year} onChange={onSelectYear}/></div>;
  if (loading) return <div className="page practice-page"><Header title="真题练习"/>{yearBar}<div className="empty" style={{marginTop:'24%'}}><div><BookOpen size={34}/></div><h3>正在加载真题…</h3><p>从本地 Markdown 解析中</p></div></div>;
  if (!questions.length) return <div className="page practice-page"><Header title="真题练习" back onBack={()=>go('home')}/>{yearBar}<div className="empty" style={{marginTop:'24%'}}><div><BookOpen size={34}/></div><h3>该年份暂无题目</h3><p>请检查 zhenti/ 目录下是否有对应年份真题</p></div></div>;
  const q = questions[Math.max(0, Math.min(index, questions.length-1))]; const saved = wrongIds.includes(q.id);
  const submit = async () => {
    if (selected === null) return;
    const isCorrect = selected === q.answer;
    setRevealed(true);
    const attemptId = await onAnswered({ questionId: q.id, year: q.year, source: q.source, selected, correct: isCorrect, topic: q.topic, answeredAt: new Date().toISOString() });
    await askAi(q, { attemptId });
  };
  const next = () => { if (index < questions.length - 1) { setIndex(index + 1); setSelected(null); setRevealed(false); } else go('home'); };
  const toggle = () => onToggleMistake(q.id, !saved);
  return <div className="page practice-page"><Header title="真题练习" action={<button className="icon-btn" onClick={toggle}>{saved?<BookmarkCheck size={21}/>:<Bookmark size={21}/>}</button>}/>
    {yearBar}
    <div className="question-meta"><span>{q.source}</span><span>第 {q.num} 题</span></div>
    <div className="question-progress"><i style={{width:`${(index+1)/questions.length*100}%`}}/></div>
    <div className="question-count"><b>{String(index+1).padStart(2,'0')}</b><span>/ {String(questions.length).padStart(2,'0')}</span></div>
    <div className="question-title"><Markdown content={q.title} className="question-stem"/></div>
    <div className="options">{q.options.map((o,i) => { let cls=selected===i?'selected':''; if(revealed && i===q.answer) cls='correct'; if(revealed && selected===i && i!==q.answer) cls='wrong'; return <button key={o} className={cls} disabled={revealed} onClick={()=>setSelected(i)}><span>{String.fromCharCode(65+i)}</span><p>{o}</p>{revealed&&i===q.answer&&<Check size={18}/>} {revealed&&selected===i&&i!==q.answer&&<X size={18}/>}</button>})}</div>
    {revealed && <section className="explain"><div className="explain-head"><Lightbulb size={18}/><b>{selected===q.answer?'回答正确':'这题需要再巩固'}</b><span className="topic-pill">{q.topic}</span></div><p>正确答案：{String.fromCharCode(65+q.answer)}。{selected===q.answer?'继续保持。':'已自动加入错题本。'}</p>{explainAi ? <Markdown content={explainAi}/> : <button className="explain-ai" onClick={()=>askAi(q)}><Sparkles size={14}/> AI 解析本题（考点、易错点、记忆口诀）</button>}{explainAi && <FollowUpPanel question={q} session={explainFollowUps[q.id]} onAsk={askFollowUp}/>}</section>}
    <div className="practice-bottom"><button className={selected===null?'disabled':'primary'} onClick={revealed?next:submit}>{revealed?(index===questions.length-1?'完成练习':'下一题'):'提交答案'} {selected!==null&&<ArrowRight size={18}/>}</button></div>
  </div>;
}

function compactChatPayload(messages) {
  const list = messages.filter(m => m.role === 'me' || m.role === 'ai').slice(-6);
  return list.map((m, i) => {
    const row = { role: m.role, text: String(m.text || '').slice(0, m.role === 'ai' ? 500 : 1000) };
    if (i === list.length - 1 && m.image) row.image = m.image;
    return row;
  });
}

function resizeImageDataUrl(dataUrl, maxSide = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('图片读取失败'));
    img.src = dataUrl;
  });
}

function ChatPage() {
  const [messages, setMessages] = useState([{ role: 'ai', text: '你好，我是软考高级系统架构设计师备考助手。可以问考点、错题、今晚学什么；也可以上传题目截图。' }]);
  const [input, setInput] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const fileRef = useRef();
  const endRef = useRef();
  const abortRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  const pick = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { alert('图片不能超过 8 MB'); return; }
    const r = new FileReader();
    r.onload = () => resizeImageDataUrl(r.result).then(setImage).catch(() => setImage(r.result));
    r.readAsDataURL(f);
  };
  const cancel = () => { abortRef.current?.abort(); setLoading(false); setStreaming(false); };
  const send = async () => {
    const prompt = input.trim() || (image ? '请识别截图里的题目，给出考点分析。' : '');
    if (!prompt && !image || loading) return;
    const history = [...messages, { role: 'me', text: prompt, image }];
    setInput(''); setImage(null); setLoading(true);
    setMessages([...history, { role: 'ai', text: '', tools: [] }]);
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const response = await api('/api/chat/stream', { method: 'POST', body: JSON.stringify({ messages: compactChatPayload(history) }), signal: ac.signal });
      if (!response.ok) { const d = await response.json().catch(() => ({})); throw new Error(d.error || '对话请求失败'); }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', content = '';
      const apply = raw => {
        for (const block of raw.split(/\n\n/)) {
          const event = (block.match(/^event:\s*(.+)$/m) || [])[1];
          const data = (block.match(/^data:\s*(.+)$/m) || [])[1];
          if (!data) continue;
          const payload = JSON.parse(data);
          if (event === 'token') {
            content += payload.text || '';
            setMessages(v => { const next = [...v]; next[next.length - 1] = { ...next[next.length - 1], text: content }; return next; });
          }
          if (event === 'tool') {
            setMessages(v => {
              const next = [...v];
              const last = { ...next[next.length - 1], tools: [...(next[next.length - 1].tools || [])] };
              const i = last.tools.findIndex(t => t.id === payload.id);
              if (i >= 0) last.tools[i] = { ...last.tools[i], ...payload };
              else last.tools.push(payload);
              next[next.length - 1] = last;
              return next;
            });
          }
          if (event === 'error') throw new Error(payload.error);
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const chunks = buffer.split(/\r?\n\r?\n/);
        buffer = chunks.pop() || '';
        if (chunks.length) apply(chunks.join('\n\n'));
        if (done) break;
      }
      if (buffer.trim()) apply(buffer);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setMessages(v => { const next = [...v]; next[next.length - 1] = { ...next[next.length - 1], text: next[next.length - 1].text || `对话失败：${e.message}` }; return next; });
    } finally { setLoading(false); setStreaming(false); abortRef.current = null; }
  };
  return <div className="page chat-page"><Header title="软考助手"/><div className={`assistant-state ${loading ? 'connecting' : 'online'}`}><span></span> {streaming ? '正在实时生成…' : loading ? '正在思考…' : '轻量助手 · qwen3.8-27b'}</div>
    <div className="chat-scroll">{messages.map((m, i) => <div key={i} className={`bubble-row ${m.role}`}>{m.role === 'ai' && <div className="bot-avatar"><Bot size={18}/></div>}<div className="bubble">{m.image && <img src={m.image}/>}{m.role === 'ai' && m.text ? <Markdown content={m.text} className="bubble-md"/> : m.text ? <p>{m.text}</p> : null}{m.tools?.map(t => <div className={`tool-card ${t.status}`} key={t.id}><span>{t.status === 'completed' ? <Check size={14}/> : <Sparkles size={14}/>}</span><div><b>{t.title}</b><small>{t.status === 'completed' ? '执行完成' : t.status === 'failed' ? '执行失败' : '正在执行…'}</small></div></div>)}</div></div>)}{loading && <div className="generating"><i/><i/><i/><span>助手正在处理</span><button onClick={cancel}>停止</button></div>}<div ref={endRef}/></div>
    <div className="composer">{image && <div className="image-preview"><img src={image}/><button onClick={() => setImage(null)}><X size={14}/></button></div>}<div className="composer-box"><button onClick={() => fileRef.current.click()}><ImagePlus size={22}/></button><input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pick} hidden/><textarea rows="1" value={input} onChange={e => setInput(e.target.value)} placeholder="问考点、错题，或拍照上传题目…" disabled={loading} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}/><button className="send-btn" onClick={send} disabled={loading || (!input.trim() && !image)}><Send size={18}/></button></div><small><Camera size={13}/> qwen3.8-27b 多模态 · 截图只送当前这一轮</small></div>
  </div>;
}

function InsightsPage({ go, stats }) {
  const mastery = stats.masteryByTopic;
  const overall = mastery.length ? Math.round(mastery.reduce((s,x)=>s+x.value,0)/mastery.length) : 0;
  const delta = stats.trend.length>=2 ? stats.trend[stats.trend.length-1].v - stats.trend[0].v : 0;
  return <div className="page insights-page"><Header title="知识画像" back onBack={()=>go('home')}/><div className="insight-summary"><div><p>综合掌握度</p><strong>{overall}<small>%</small></strong><span><ArrowRight size={13}/> {stats.totalDone?`已刷 ${stats.totalDone} 题`:'暂无答题数据'}</span></div><div className="radar">{mastery.length>=3&&<ResponsiveContainer width="100%" height={180}><RadarChart data={mastery} outerRadius="68%"><PolarGrid stroke="#dce7e1"/><PolarAngleAxis dataKey="subject" tick={{fontSize:10,fill:'#64736b'}}/><Radar dataKey="value" stroke="#28745d" fill="#4c9b81" fillOpacity={.34}/></RadarChart></ResponsiveContainer>}</div></div>
    <div className="section-title"><div><h3>正确率趋势</h3><p>最近 7 天练习表现</p></div>{stats.trend.length>=2&&<b className={delta>=0?'up':'down'}>{delta>=0?'+':''}{delta}%</b>}</div><section className="trend-card">{stats.trend.length>0?<ResponsiveContainer width="100%" height={155}><AreaChart data={stats.trend} margin={{top:10,right:8,left:-20,bottom:0}}><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2c7a62" stopOpacity=".28"/><stop offset="1" stopColor="#2c7a62" stopOpacity="0"/></linearGradient></defs><Tooltip/><Area type="monotone" dataKey="v" stroke="#2c7a62" strokeWidth={3} fill="url(#area)"/></AreaChart></ResponsiveContainer>:<div className="empty" style={{padding:'2rem 0'}}><p>完成几道题后展示趋势</p></div>}</section>
    <div className="section-title"><div><h3>知识点掌握</h3><p>按答题记录统计</p></div></div><section className="mastery-list">{mastery.length?[...mastery].sort((a,b)=>a.value-b.value).map(x=><div key={x.subject}><span>{x.subject}</span><i><em style={{width:`${x.value}%`}}/></i><b className={x.value<55?'low':''}>{x.value}%</b></div>):<div className="empty" style={{padding:'1rem 0'}}><p>暂无知识点数据</p></div>}</section>
  </div>;
}

function MistakesPage({ go, questions, wrongIds, onToggleMistake, stats, redo }) {
  const [list,setList]=useState(null), [filter,setFilter]=useState('all');
  useEffect(()=>{
    if(!wrongIds.length){ setList([]); return; }
    let alive=true;
    api(`/api/questions?ids=${encodeURIComponent(wrongIds.join(','))}&pageSize=100`)
      .then(r=>r.json())
      .then(d=>{ if(alive) setList(d.questions||[]); })
      .catch(()=>{ if(alive) setList(questions.filter(q=>wrongIds.includes(q.id))); });
    return ()=>{alive=false};
  },[wrongIds,questions]);
  const items=list??questions.filter(q=>wrongIds.includes(q.id));
  // 待复习 = 该题最近一次答题仍是错的；已掌握 = 收录后最近一次已答对
  const lastAttempt=new Map();
  for(const a of (stats.attempts||[])) lastAttempt.set(a.questionId, a.correct);
  const wrong=items.filter(q=>lastAttempt.get(q.id)!==true);
  const mastered=items.filter(q=>lastAttempt.get(q.id)===true);
  const shown=filter==='wrong'?wrong:filter==='mastered'?mastered:items;
  return <div className="page simple-page"><Header title="我的错题" back onBack={()=>go('home')}/><div className="filter-row"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>全部 {items.length}</button><button className={filter==='wrong'?'active':''} onClick={()=>setFilter('wrong')}>待复习 {wrong.length}</button><button className={filter==='mastered'?'active':''} onClick={()=>setFilter('mastered')}>已掌握 {mastered.length}</button></div>{shown.length?<div className="mistake-list">{shown.map(q=><article key={q.id}><div><span>{q.source}</span><button onClick={()=>onToggleMistake(q.id,false)} title="移出错题本"><BookmarkCheck size={19}/></button></div><h3>{q.title}</h3><footer><span>{q.topic}</span><button onClick={()=>redo(q)}>再做一次 <ChevronRight size={15}/></button></footer></article>)}</div>:<div className="empty"><div><BookmarkCheck size={34}/></div><h3>{filter==='all'?'还没有错题':'该分类下暂无题目'}</h3><p>答错的题会自动收录在这里</p><button onClick={()=>go('practice')}>去刷真题</button></div>}</div> }

function ProfilePage({ go, stats }) { return <div className="page profile-page"><Header title="我的学习"/><section className="profile-card"><div className="profile-avatar">L</div><div><h2>准架构师</h2><p>目标：2026 年下半年系统架构设计师</p></div><span>备考中</span></section><div className="profile-stats"><div><b>{stats.studyDays}</b><small>连续学习/天</small></div><div><b>{stats.totalDone?Math.round(stats.recentAccuracy*100)+'%':'—'}</b><small>近20题正确率</small></div><div><b>{stats.mistakeCount}</b><small>待复习错题</small></div></div><h3 className="group-title">学习分析</h3><div className="menu-list"><button onClick={()=>go('plan')}><span className="green"><Target/></span><p><b>复习计划</b><small>阶段任务与到期复习</small></p><ChevronRight/></button><button onClick={()=>go('insights')}><span className="green"><BarChart3/></span><p><b>知识画像</b><small>掌握度与薄弱项分析</small></p><ChevronRight/></button><button onClick={()=>go('mistakes')}><span className="orange"><BookmarkCheck/></span><p><b>错题本</b><small>针对性复习与重做</small></p><ChevronRight/></button></div><h3 className="group-title">备考设置</h3><div className="menu-list"><div className="menu-static"><span className="purple"><Target/></span><p><b>考试目标</b><small>2026-10-24 至 10-27 · 广东</small></p></div><div className="menu-static"><span className="gray"><RotateCcw/></span><p><b>复习偏好</b><small>严格评分 · 优先可核验真题</small></p></div></div></div> }

function Nav({ current, go }) { const items=[['home',Home,'首页'],['practice',BookOpen,'刷题'],['plan',Target,'计划'],['profile',CircleUserRound,'我的']]; return <nav className="bottom-nav">{items.map(([id,Icon,label])=><button key={id} className={current===id?'active':''} onClick={()=>go(id)}><Icon size={22}/><span>{label}</span></button>)}</nav> }

function AccessGate({ onAuthorized }) {
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('请输入有效 Token 后继续');
  const submit = async event => {
    event.preventDefault(); setChecking(true); setError('正在验证…');
    try {
      if (await checkAccessToken(input.trim())) { localStorage.setItem(ACCESS_TOKEN_KEY, input.trim()); onAuthorized(); }
      else setError('Token 不匹配，请重新输入');
    } catch { setError('验证服务暂时不可用，请稍后重试'); }
    finally { setChecking(false); }
  };
  return <main className="access-gate"><form onSubmit={submit}><div className="brand-mark"><span>R</span></div><h1>架构上岸</h1><p>请输入访问 Token 才能继续使用备考资料。</p><input autoFocus type="password" value={input} onChange={e=>setInput(e.target.value)} placeholder="Token"/><button type="submit" disabled={checking || !input.trim()}>{checking?'验证中…':'进入备考页面'}</button><small>{error}</small></form></main>;
}

function MainApp(){
  const [page,setPage]=useState('home');
  const [explainAi,setExplainAi]=useState('');
  const [explainFollowUps,setExplainFollowUps]=useState({});
  const [startPractice,setStartPractice]=useState(null); // {year, num} 从错题本「再做一次」进入
  // token 落库后从地址栏清除，避免留在历史记录/分享截图
  useEffect(()=>{
    const qp=new URLSearchParams(location.search);
    if(qp.get('token')){
      localStorage.setItem('rk_acp_token',qp.get('token'));
      qp.delete('token');
      const rest=qp.toString();
      history.replaceState(null,'',location.pathname+(rest?'?'+rest:'')+location.hash);
    }
  },[]);
  const [questions,setQuestions]=useState([]);
  const [questionsLoading,setQuestionsLoading]=useState(true);
  const [years,setYears]=useState([]);
  const [year,setYear]=useState('2024下');
  const [stats,setStats]=useState(EMPTY_STATS);
  const [plan,setPlan]=useState(null);
  const [wrongIds,setWrongIds]=useState([]);
  const activeSecondsRef=useRef(0), activitySeqRef=useRef(0), lastInteractionRef=useRef(Date.now()), flushRef=useRef(()=>{});

  const refreshStats=useCallback(async()=>{
    try{
      const [s, st, p] = await Promise.all([
        api('/api/stats').then(r=>r.json()),
        api('/api/state').then(r=>r.json()),
        api('/api/review-plan').then(r=>r.json()),
      ]);
      setStats({...EMPTY_STATS, ...s});
      setPlan(p.plan || null);
      setWrongIds(((st.mistakes&&st.mistakes.items)||[]).map(m=>m.questionId));
    }catch(e){ console.error('刷新统计失败', e); }
  },[]);

  // 加载题目：年份变化时重新拉取
  useEffect(()=>{
    let alive=true;
    setQuestionsLoading(true);
    (async()=>{
      try{
        const url=`/api/questions?year=${encodeURIComponent(year)}&pageSize=100`;
        const data=await api(url).then(r=>r.json());
        if(alive) setQuestions(data.questions||[]);
      }catch(e){ console.error('加载真题失败', e); }
      finally{ if(alive) setQuestionsLoading(false); }
    })();
    return ()=>{alive=false};
  },[year]);

  // 加载年份列表（一次性）
  useEffect(()=>{
    api('/api/years').then(r=>r.json())
      .then(d=>{ setYears(d.years||[]); })
      .catch(e=>console.error('加载年份列表失败', e));
    refreshStats();
  },[refreshStats]);

  // 只在刷题页、标签可见且用户近期有交互时累计；每 30 秒节流写入一次。
  useEffect(()=>{
    const touch=()=>{lastInteractionRef.current=Date.now()};
    const events=['pointerdown','keydown','scroll','touchstart'];
    events.forEach(name=>window.addEventListener(name,touch,{passive:true}));
    const flush=()=>{
      const seconds=Math.floor(activeSecondsRef.current);
      if(seconds<1)return;
      activeSecondsRef.current-=seconds;
      const clientId=`${Date.now()}-${activitySeqRef.current++}-${Math.random().toString(36).slice(2)}`;
      api('/api/study-activity',{method:'POST',body:JSON.stringify({clientId,seconds,occurredAt:new Date().toISOString()})}).then(()=>refreshStats()).catch(e=>{activeSecondsRef.current+=seconds;console.error('学习活跃时间写入失败',e)});
    };
    const tick=setInterval(()=>{
      if(page==='practice'&&document.visibilityState==='visible')activeSecondsRef.current++;
    },1000);
    flushRef.current=flush;
    const writer=setInterval(flush,30000);
    const visibility=()=>{if(document.visibilityState==='hidden')flush()};
    document.addEventListener('visibilitychange',visibility);
    return()=>{events.forEach(name=>window.removeEventListener(name,touch));clearInterval(tick);clearInterval(writer);document.removeEventListener('visibilitychange',visibility);flushRef.current()};
  },[page,refreshStats]);

  const onSelectYear=useCallback(y=>setYear(y),[]);

  const onAnswered=useCallback(payload=>{
    return api('/api/attempts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(r=>r.json().then(data=>{if(!r.ok)throw new Error(data.error||'记录答题失败');return data.id;}))
      .then(id=>{ refreshStats(); return id; })
      .catch(e=>{ console.error('记录答题失败', e); return null; });
  },[refreshStats]);

  const askAi=useCallback(async (q, options={})=>{
    setExplainAi('');
    try {
      const response=await api('/api/explain/stream',{method:'POST',body:JSON.stringify({question:q.title,options:q.options,answer:q.answer,source:q.source,topic:q.topic})});
      if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.error||'解析请求失败');}
      const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer='', content='';
      const consume=raw=>{ for(const block of raw.split(/\n\n/)){ const event=(block.match(/^event:\s*(.+)$/m)||[])[1]; const data=(block.match(/^data:\s*(.+)$/m)||[])[1]; if(!data)continue; try{const payload=JSON.parse(data);if(event==='token'){content+=payload.text;setExplainAi(content)}if(event==='error')throw new Error(payload.error)}catch(e){if(event==='error')throw e;} } };
      while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const chunks=buffer.split(/\r?\n\r?\n/);buffer=chunks.pop()||'';consume(chunks.join('\n\n'));if(done)break;}
      if(options.attemptId) await api(`/api/attempts/${encodeURIComponent(options.attemptId)}/explanation`,{method:'PATCH',body:JSON.stringify({explanation:content})});
    } catch (e) { setExplainAi(`解析失败：${e.message}`); }
  },[]);

  const askFollowUp=useCallback(async(q, message, previousTurns)=>{
    const key=q.id;
    const history=Array.isArray(previousTurns)?previousTurns:[];
    const userTurn={role:'user',content:message};
    setExplainFollowUps(prev=>({...prev,[key]:{items:[...history,userTurn,{role:'assistant',content:''}],loading:true,error:''}}));
    try {
      const response=await api('/api/explain/follow-up/stream',{method:'POST',body:JSON.stringify({question:q.title,options:q.options,answer:q.answer,source:q.source,topic:q.topic,explanation:explainAi,history,message})});
      if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.error||'追问请求失败');}
      const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer='',content='';
      const update=text=>setExplainFollowUps(prev=>{const current=prev[key];if(!current)return prev;const items=current.items.slice();items[items.length-1]={role:'assistant',content:text};return {...prev,[key]:{...current,items}}});
      const consume=raw=>{for(const block of raw.split(/\n\n/)){const event=(block.match(/^event:\s*(.+)$/m)||[])[1];const data=(block.match(/^data:\s*(.+)$/m)||[])[1];if(!data)continue;try{const payload=JSON.parse(data);if(event==='token'){content+=payload.text;update(content)}if(event==='error')throw new Error(payload.error)}catch(e){if(event==='error')throw e;}}};
      while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const chunks=buffer.split(/\r?\n\r?\n/);buffer=chunks.pop()||'';consume(chunks.join('\n\n'));if(done)break;}
      setExplainFollowUps(prev=>({...prev,[key]:{...prev[key],loading:false}}));
    } catch(e) {
      setExplainFollowUps(prev=>({...prev,[key]:{...prev[key],loading:false,error:`追问失败：${e.message}`}}));
    }
  },[explainAi]);

  const onToggleMistake=useCallback((qid,add)=>{
    setWrongIds(prev=>add?(prev.includes(qid)?prev:[...prev,qid]):prev.filter(x=>x!==qid));
    api('/api/mistakes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({questionId:qid,action:add?'add':'remove'})})
      .then(()=>refreshStats())
      .catch(e=>console.error('更新错题失败', e));
  },[refreshStats]);

  const root=['home','practice','chat','profile','plan'].includes(page);
  return <main className="app-shell"><div className="phone"><div className="content">{page==='home'&&<HomePage go={setPage} stats={stats}/>} {page==='plan'&&<ReviewPlanPage go={setPage} stats={stats} plan={plan}/>} {page==='practice'&&<PracticePage go={setPage} questions={questions} loading={questionsLoading} years={years} year={year} startNum={startPractice&&startPractice.year===year?startPractice.num:null} onConsumedStart={()=>setStartPractice(null)} onSelectYear={onSelectYear} wrongIds={wrongIds} onAnswered={onAnswered} onToggleMistake={onToggleMistake} askAi={askAi} explainAi={explainAi} explainFollowUps={explainFollowUps} askFollowUp={askFollowUp}/>} {page==='chat'&&<ChatPage/>} {page==='insights'&&<InsightsPage go={setPage} stats={stats}/>} {page==='mistakes'&&<MistakesPage go={setPage} questions={questions} wrongIds={wrongIds} onToggleMistake={onToggleMistake} stats={stats} redo={t=>{setYear(t.year);setStartPractice({year:t.year,num:t.num});setPage('practice')}}/>} {page==='profile'&&<ProfilePage go={setPage} stats={stats}/>}</div>{root&&<Nav current={page} go={setPage}/>}</div></main>;
}

function App(){
  const [authorized,setAuthorized]=useState(null);
  useEffect(()=>{ checkAccessToken(getStoredToken()).then(ok=>setAuthorized(ok)).catch(()=>setAuthorized(false)); },[]);
  if (authorized !== true) return <AccessGate onAuthorized={()=>setAuthorized(true)}/>;
  return <MainApp/>;
}

createRoot(document.getElementById('root')).render(<App/>);

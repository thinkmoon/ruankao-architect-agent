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
import './acp.css';

const EMPTY_STATS = { totalDone: 0, mistakeCount: 0, recentAccuracy: 0, studyDays: 0, trend: [], masteryByTopic: [], studyMinutes: 0 };
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
  return <div className="page home-page">
    <div className="home-head"><div><p>晚上好，架构师 👋</p><h1>今天也离上岸更近一步</h1></div><button className="avatar"><CircleUserRound size={26}/></button></div>
    <section className="hero-card">
      <div className="hero-copy"><span className="eyebrow"><Flame size={14}/> 连续学习 {stats.studyDays} 天</span><h2>今日学习计划</h2><p>综合知识 · 历年真题</p><div className="progress-track"><i style={{width:`${Math.min(100, Math.round(stats.totalDone/DAILY_GOAL*100))}%`}}/></div><small>已累计完成 {stats.totalDone} 题 · 每日目标 {DAILY_GOAL} 题</small></div>
      <div className="hero-ring"><strong>{stats.totalDone ? acc : 0}</strong><span>%</span></div>
      <button onClick={() => go('practice')} className="hero-action">继续学习 <ArrowRight size={17}/></button>
    </section>
    <div className="quick-grid">
      <button onClick={() => go('practice')}><span className="quick-icon green"><BookOpen/></span><b>真题练习</b><small>历年真题随时刷</small></button>
      <button onClick={() => go('mistakes')}><span className="quick-icon orange"><BookmarkCheck/></span><b>我的错题</b><small>{stats.mistakeCount} 道待巩固</small></button>
      <button onClick={() => go('chat')}><span className="quick-icon purple"><Sparkles/></span><b>AI 答疑</b><small>截图秒懂难题</small></button>
      <button onClick={() => go('insights')}><span className="quick-icon blue"><BarChart3/></span><b>知识画像</b><small>查看薄弱知识点</small></button>
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

function PracticePage({ go, questions, loading, years, year, startNum, onConsumedStart, onSelectYear, wrongIds, onAnswered, onToggleMistake, askAi, explainAi }) {
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
    if (!isCorrect) onToggleMistake(q.id, true);
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
    {revealed && <section className="explain"><div className="explain-head"><Lightbulb size={18}/><b>{selected===q.answer?'回答正确':'这题需要再巩固'}</b><span className="topic-pill">{q.topic}</span></div><p>正确答案：{String.fromCharCode(65+q.answer)}。{selected===q.answer?'继续保持。':'已自动加入错题本。'}</p>{explainAi ? <Markdown content={explainAi}/> : <button className="explain-ai" onClick={()=>askAi(q)}><Sparkles size={14}/> AI 解析本题（考点、易错点、记忆口诀）</button>}</section>}
    <div className="practice-bottom"><button className={selected===null?'disabled':'primary'} onClick={revealed?next:submit}>{revealed?(index===questions.length-1?'完成练习':'下一题'):'提交答案'} {selected!==null&&<ArrowRight size={18}/>}</button></div>
  </div>;
}

function useAcp() {
  const [messages, setMessages] = useState([{role:'ai', text:'你好，我是运行在当前软考项目中的 Claude Code。你可以直接问知识点，或上传题目截图；我会结合仓库资料分析，并按需更新学习记录。'}]);
  const [status,setStatus]=useState('connecting'), [loading,setLoading]=useState(false), [permission,setPermission]=useState(null), [sessionId,setSessionId]=useState(null);
  const socketRef=useRef(null);
  useEffect(()=>{
    const protocol=location.protocol==='https:'?'wss':'ws'; const queryToken=new URLSearchParams(location.search).get('token'); if(queryToken)localStorage.setItem('rk_acp_token',queryToken); const token=queryToken||localStorage.getItem('rk_acp_token')||''; const socket=new WebSocket(`${protocol}://${location.host}/ws/acp?token=${encodeURIComponent(token)}`); socketRef.current=socket;
    socket.onmessage=event=>{const data=JSON.parse(event.data);
      if(data.type==='ready'){setStatus('online');setSessionId(data.sessionId)}
      if(data.type==='status')setStatus(data.status);
      if(data.type==='permission')setPermission(data);
      if(data.type==='error'){setMessages(v=>[...v,{role:'system',text:`连接错误：${data.message}`}]);setLoading(false)}
      if(data.type==='turn'){setLoading(data.status==='running')}
      if(data.type==='update')setMessages(v=>applyAcpUpdate(v,data.update));
    };
    socket.onerror=()=>setStatus('offline'); socket.onclose=event=>{setStatus('offline');if(event.code===1006)setMessages(v=>[...v,{role:'system',text:'ACP 连接被拒绝，请使用服务启动时输出的带 token 链接访问。'}])};
    return()=>socket.close();
  },[]);
  const send=(text,image)=>{if(socketRef.current?.readyState!==WebSocket.OPEN)return false; const prompt=text.trim()||'请分析截图里的题目，给出答案、考点、易错原因，并更新我的知识点掌握情况。'; setMessages(v=>[...v,{role:'me',text:prompt,image},{role:'ai',text:'',tools:[]}]);socketRef.current.send(JSON.stringify({type:'prompt',text:prompt,image}));return true};
  const answerPermission=optionId=>{socketRef.current?.send(JSON.stringify({type:'permission_response',requestId:permission.requestId,optionId}));setPermission(null)};
  const cancel=()=>socketRef.current?.send(JSON.stringify({type:'cancel'}));
  return {messages,status,loading,permission,sessionId,send,answerPermission,cancel};
}

function applyAcpUpdate(messages, update) {
  const next=[...messages]; let index=next.length-1;
  while(index>=0&&next[index].role!=='ai')index--;
  if(index<0){next.push({role:'ai',text:'',tools:[]});index=next.length-1}
  const current={...next[index],tools:[...(next[index].tools||[])]};
  if(update.sessionUpdate==='agent_message_chunk'&&update.content?.type==='text')current.text=(current.text||'')+update.content.text;
  if(update.sessionUpdate==='agent_thought_chunk'&&update.content?.type==='text')current.thought=(current.thought||'')+update.content.text;
  if(update.sessionUpdate==='tool_call')current.tools.push({id:update.toolCallId,title:update.title||'调用工具',status:update.status||'pending',kind:update.kind});
  if(update.sessionUpdate==='tool_call_update'){const tool=current.tools.find(x=>x.id===update.toolCallId);if(tool)Object.assign(tool,{status:update.status||tool.status,title:update.title||tool.title});}
  next[index]=current; return next;
}

function ChatPage({ acp }) {
  const [input,setInput]=useState(''), [image,setImage]=useState(null); const fileRef=useRef(), endRef=useRef();
  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:'smooth'}); },[acp.messages,acp.loading]);
  const pick=e=>{const f=e.target.files?.[0]; if(f){if(f.size>8*1024*1024){alert('图片不能超过 8 MB');return}const r=new FileReader();r.onload=()=>setImage(r.result);r.readAsDataURL(f)}};
  const send=()=>{if((input.trim()||image)&&acp.send(input,image)){setInput('');setImage(null)}};
  const labels={connecting:'正在连接 Claude Code…',online:'Claude Code · ACP 已连接',offline:'ACP 连接已断开'};
  return <div className="page chat-page"><Header title="Claude Code 助手"/><div className={`assistant-state ${acp.status}`}><span></span> {labels[acp.status]||acp.status}{acp.sessionId&&<small> · {acp.sessionId.slice(0,8)}</small>}</div><div className="chat-scroll">{acp.messages.map((m,i)=><div key={i} className={`bubble-row ${m.role}`} >{m.role==='ai'&&<div className="bot-avatar"><Bot size={18}/></div>}<div className="bubble">{m.image&&<img src={m.image}/>} {m.text&&<p>{m.text}</p>}{m.tools?.map(t=><div className={`tool-card ${t.status}`} key={t.id}><span>{t.status==='completed'?<Check size={14}/>:<Sparkles size={14}/>}</span><div><b>{t.title}</b><small>{t.status==='completed'?'执行完成':t.status==='failed'?'执行失败':'正在执行…'}</small></div></div>)}</div></div>)}{acp.loading&&<div className="generating"><i/><i/><i/><span>Claude 正在处理</span><button onClick={acp.cancel}>停止</button></div>}<div ref={endRef}/></div>
    {acp.permission&&<div className="permission-sheet"><div><span className="permission-icon"><Bot/></span><h3>Claude 请求执行工具</h3><p>{acp.permission.request.toolCall?.title||'需要你的授权才能继续'}</p><div className="permission-actions">{acp.permission.request.options.map(o=><button key={o.optionId} className={o.kind?.includes('allow')?'allow':''} onClick={()=>acp.answerPermission(o.optionId)}>{o.name}</button>)}</div></div></div>}
    <div className="composer">{image&&<div className="image-preview"><img src={image}/><button onClick={()=>setImage(null)}><X size={14}/></button></div>}<div className="composer-box"><button onClick={()=>fileRef.current.click()}><ImagePlus size={22}/></button><input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pick} hidden/><textarea rows="1" value={input} onChange={e=>setInput(e.target.value)} placeholder={acp.status==='online'?'输入问题，或拍照上传题目…':'正在等待 ACP 连接…'} disabled={acp.status!=='online'||acp.loading} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}/><button className="send-btn" onClick={send} disabled={acp.status!=='online'||acp.loading}><Send size={18}/></button></div><small><Camera size={13}/> 图片将通过 ACP 发送给当前项目中的 Claude Code</small></div>
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

function ProfilePage({ go, stats }) { return <div className="page profile-page"><Header title="我的学习"/><section className="profile-card"><div className="profile-avatar">L</div><div><h2>准架构师</h2><p>目标：2026 年下半年系统架构设计师</p></div><span>备考中</span></section><div className="profile-stats"><div><b>{stats.studyDays}</b><small>连续学习/天</small></div><div><b>{stats.totalDone?Math.round(stats.recentAccuracy*100)+'%':'—'}</b><small>近20题正确率</small></div><div><b>{stats.mistakeCount}</b><small>待复习错题</small></div></div><h3 className="group-title">学习分析</h3><div className="menu-list"><button onClick={()=>go('insights')}><span className="green"><BarChart3/></span><p><b>知识画像</b><small>掌握度与薄弱项分析</small></p><ChevronRight/></button><button onClick={()=>go('mistakes')}><span className="orange"><BookmarkCheck/></span><p><b>错题本</b><small>针对性复习与重做</small></p><ChevronRight/></button></div><h3 className="group-title">备考设置</h3><div className="menu-list"><div className="menu-static"><span className="purple"><Target/></span><p><b>考试目标</b><small>2026-10-24 至 10-27 · 广东</small></p></div><div className="menu-static"><span className="gray"><RotateCcw/></span><p><b>复习偏好</b><small>严格评分 · 优先可核验真题</small></p></div></div></div> }

function Nav({ current, go }) { const items=[['home',Home,'首页'],['practice',BookOpen,'刷题'],['chat',MessageCircle,'AI 助手'],['profile',CircleUserRound,'我的']]; return <nav className="bottom-nav">{items.map(([id,Icon,label])=><button key={id} className={current===id?'active':''} onClick={()=>go(id)}><Icon size={22}/><span>{label}</span></button>)}</nav> }

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
  const [startPractice,setStartPractice]=useState(null); // {year, num} 从错题本「再做一次」进入
  const acp=useAcp();
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
  const [wrongIds,setWrongIds]=useState([]);

  const refreshStats=useCallback(async()=>{
    try{
      const [s, st] = await Promise.all([
        api('/api/stats').then(r=>r.json()),
        api('/api/state').then(r=>r.json()),
      ]);
      setStats({...EMPTY_STATS, ...s});
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

  const onToggleMistake=useCallback((qid,add)=>{
    setWrongIds(prev=>add?(prev.includes(qid)?prev:[...prev,qid]):prev.filter(x=>x!==qid));
    api('/api/mistakes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({questionId:qid,action:add?'add':'remove'})})
      .then(()=>refreshStats())
      .catch(e=>console.error('更新错题失败', e));
  },[refreshStats]);

  const root=['home','practice','chat','profile'].includes(page);
  return <main className="app-shell"><div className="phone"><div className="content">{page==='home'&&<HomePage go={setPage} stats={stats}/>} {page==='practice'&&<PracticePage go={setPage} questions={questions} loading={questionsLoading} years={years} year={year} startNum={startPractice&&startPractice.year===year?startPractice.num:null} onConsumedStart={()=>setStartPractice(null)} onSelectYear={onSelectYear} wrongIds={wrongIds} onAnswered={onAnswered} onToggleMistake={onToggleMistake} askAi={askAi} explainAi={explainAi}/>} {page==='chat'&&<ChatPage acp={acp}/>} {page==='insights'&&<InsightsPage go={setPage} stats={stats}/>} {page==='mistakes'&&<MistakesPage go={setPage} questions={questions} wrongIds={wrongIds} onToggleMistake={onToggleMistake} stats={stats} redo={t=>{setYear(t.year);setStartPractice({year:t.year,num:t.num});setPage('practice')}}/>} {page==='profile'&&<ProfilePage go={setPage} stats={stats}/>}</div>{root&&<Nav current={page} go={setPage}/>}</div></main>;
}

function App(){
  const [authorized,setAuthorized]=useState(null);
  useEffect(()=>{ checkAccessToken(getStoredToken()).then(ok=>setAuthorized(ok)).catch(()=>setAuthorized(false)); },[]);
  if (authorized !== true) return <AccessGate onAuthorized={()=>setAuthorized(true)}/>;
  return <MainApp/>;
}

createRoot(document.getElementById('root')).render(<App/>);

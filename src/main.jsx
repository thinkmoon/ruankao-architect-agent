import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Area, AreaChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, Bookmark, BookmarkCheck, Bot, Camera, Check, ChevronRight, CircleUserRound, Clock3, Flame, Home, ImagePlus, Lightbulb, MessageCircle, MoreHorizontal, RotateCcw, Send, Sparkles, Target, Trophy, X } from 'lucide-react';
import './styles.css';
import './acp.css';

const questions = [
  { id: '2024-2-03', source: '2024 下半年 · 综合知识', title: '路由器在 OSI 模型的（ ）。', options: ['网络层', '物理层', '传输层', '数据链路层'], answer: 0, topic: '计算机网络', difficulty: '基础', explain: '路由器根据 IP 地址进行分组转发，工作在 OSI 的网络层。交换机通常工作在数据链路层。' },
  { id: '2024-2-05', source: '2024 下半年 · 综合知识', title: '系统架构组成的 4+1 视图，包括下面的（ ）视图。', options: ['逻辑、实现、进程、物理和部署', '逻辑、用例、进程、物理和场景', '逻辑、用例、进程、物理和部署', '逻辑、开发、进程、物理和场景'], answer: 3, topic: '软件架构设计', difficulty: '高频', explain: 'Kruchten 4+1 视图包括逻辑视图、开发视图、进程视图、物理视图，以及用于串联和验证的场景视图。' },
  { id: '2024-2-13', source: '2024 下半年 · 综合知识', title: '软件因适应新需求或需求变化而增加新功能的能力是（ ）。', options: ['安全性', '可扩展性', '性能', '可重用性'], answer: 1, topic: '质量属性', difficulty: '易错', explain: '可扩展性强调在原系统上增加新功能的能力；可修改性强调修改成本，两者在考试中需要区分。' },
  { id: '2023-2-18', source: '2023 下半年 · 综合知识', title: '在面向对象设计原则中，要求一个类只承担一个变化原因的是（ ）。', options: ['开闭原则', '单一职责原则', '依赖倒置原则', '接口隔离原则'], answer: 1, topic: '软件工程', difficulty: '基础', explain: '单一职责原则（SRP）：一个类应该只有一个引起它变化的原因。' }
];

const mastery = [
  { subject: '系统工程', value: 72 }, { subject: '项目管理', value: 46 }, { subject: '软件工程', value: 68 },
  { subject: '架构设计', value: 82 }, { subject: '网络安全', value: 52 }, { subject: '人工智能', value: 61 }
];
const trend = [{ d: '8/12', v: 48 }, { d: '8/13', v: 56 }, { d: '8/14', v: 53 }, { d: '8/15', v: 64 }, { d: '8/16', v: 67 }, { d: '8/17', v: 70 }, { d: '今天', v: 76 }];

function useStored(key, initial) {
  const [value, setValue] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) ?? initial; } catch { return initial; } });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}

function Header({ title, back, onBack, action }) {
  return <header className="topbar">{back ? <button className="icon-btn" onClick={onBack}><ArrowLeft size={22}/></button> : <div className="brand-mark"><span>R</span></div>}<div className="top-title">{title}</div>{action || <button className="icon-btn"><MoreHorizontal size={22}/></button>}</header>;
}

function HomePage({ go, stats }) {
  return <div className="page home-page">
    <div className="home-head"><div><p>晚上好，架构师 👋</p><h1>今天也离上岸更近一步</h1></div><button className="avatar"><CircleUserRound size={26}/></button></div>
    <section className="hero-card">
      <div className="hero-copy"><span className="eyebrow"><Flame size={14}/> 连续学习 6 天</span><h2>今日学习计划</h2><p>综合知识 · 软件架构风格专项</p><div className="progress-track"><i style={{width:'42%'}}/></div><small>已完成 2 / 5 题</small></div>
      <div className="hero-ring"><strong>42</strong><span>%</span></div>
      <button onClick={() => go('practice')} className="hero-action">继续学习 <ArrowRight size={17}/></button>
    </section>
    <div className="quick-grid">
      <button onClick={() => go('practice')}><span className="quick-icon green"><BookOpen/></span><b>真题练习</b><small>历年真题随时刷</small></button>
      <button onClick={() => go('mistakes')}><span className="quick-icon orange"><BookmarkCheck/></span><b>我的错题</b><small>{stats.mistakes} 道待巩固</small></button>
      <button onClick={() => go('chat')}><span className="quick-icon purple"><Sparkles/></span><b>AI 答疑</b><small>截图秒懂难题</small></button>
      <button onClick={() => go('insights')}><span className="quick-icon blue"><BarChart3/></span><b>知识画像</b><small>查看薄弱知识点</small></button>
    </div>
    <div className="section-title"><div><h3>本周学情</h3><p>保持节奏，稳步提升</p></div><button onClick={() => go('insights')}>详情 <ChevronRight size={15}/></button></div>
    <section className="weekly-card">
      <div className="metric"><span><Target size={18}/></span><div><strong>{stats.done}</strong><small>完成题目</small></div></div>
      <div className="metric"><span><Trophy size={18}/></span><div><strong>76%</strong><small>当前正确率</small></div></div>
      <div className="metric"><span><Clock3 size={18}/></span><div><strong>4.2h</strong><small>学习时长</small></div></div>
      <div className="mini-chart"><ResponsiveContainer width="100%" height={72}><AreaChart data={trend}><defs><linearGradient id="mini" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2c7a62" stopOpacity=".35"/><stop offset="1" stopColor="#2c7a62" stopOpacity="0"/></linearGradient></defs><Area type="monotone" dataKey="v" stroke="#2c7a62" strokeWidth={2.5} fill="url(#mini)"/></AreaChart></ResponsiveContainer></div>
    </section>
    <div className="section-title"><div><h3>薄弱知识点</h3><p>AI 根据近期答题动态生成</p></div></div>
    <section className="weak-list"><div><span className="weak-num">01</span><p><b>项目进度管理</b><small>掌握度 46% · 建议复习关键路径</small></p><i><em style={{width:'46%'}}/></i></div><div><span className="weak-num">02</span><p><b>网络安全体系</b><small>掌握度 52% · 近 3 题错 2 题</small></p><i><em style={{width:'52%'}}/></i></div></section>
  </div>;
}

function PracticePage({ go, wrongIds, setWrongIds, done, setDone }) {
  const [index, setIndex] = useState(0), [selected, setSelected] = useState(null), [revealed, setRevealed] = useState(false);
  const q = questions[index]; const saved = wrongIds.includes(q.id);
  const submit = () => { if (selected === null) return; setRevealed(true); setDone(Math.max(done, index + 1)); if (selected !== q.answer && !wrongIds.includes(q.id)) setWrongIds([...wrongIds, q.id]); };
  const next = () => { if (index < questions.length - 1) { setIndex(index + 1); setSelected(null); setRevealed(false); } else go('home'); };
  const toggle = () => setWrongIds(saved ? wrongIds.filter(x => x !== q.id) : [...wrongIds, q.id]);
  return <div className="page practice-page"><Header title="真题练习" action={<button className="icon-btn" onClick={toggle}>{saved?<BookmarkCheck size={21}/>:<Bookmark size={21}/>}</button>}/>
    <div className="question-meta"><span>{q.source}</span><span>{q.difficulty}</span></div>
    <div className="question-progress"><i style={{width:`${(index+1)/questions.length*100}%`}}/></div>
    <div className="question-count"><b>{String(index+1).padStart(2,'0')}</b><span>/ {String(questions.length).padStart(2,'0')}</span></div>
    <h2 className="question-title">{q.title}</h2>
    <div className="options">{q.options.map((o,i) => { let cls=selected===i?'selected':''; if(revealed && i===q.answer) cls='correct'; if(revealed && selected===i && i!==q.answer) cls='wrong'; return <button key={o} className={cls} disabled={revealed} onClick={()=>setSelected(i)}><span>{String.fromCharCode(65+i)}</span><p>{o}</p>{revealed&&i===q.answer&&<Check size={18}/>} {revealed&&selected===i&&i!==q.answer&&<X size={18}/>}</button>})}</div>
    {revealed && <section className="explain"><div><Lightbulb size={18}/><b>{selected===q.answer?'回答正确':'这题需要再巩固'}</b><span className="topic-pill">{q.topic}</span></div><p>{q.explain}</p></section>}
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
    {acp.permission&&<div className="permission-sheet"><div><span className="permission-icon"><Bot/></span><h3>Claude 请求执行工具</h3><p>{acp.permission.request.toolCall?.title||'需要你的授权才能继续'}</p><div className="permission-actions">{acp.permission.request.options.map(o=><button key={o.optionId} className={o.kind?.includes('allow')?'allow':''} onClick={()=>acp.answerPermission(o.optionId)}>{o.name}</button>)}<button onClick={()=>acp.answerPermission(null)}>取消本次操作</button></div></div></div>}
    <div className="composer">{image&&<div className="image-preview"><img src={image}/><button onClick={()=>setImage(null)}><X size={14}/></button></div>}<div className="composer-box"><button onClick={()=>fileRef.current.click()}><ImagePlus size={22}/></button><input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pick} hidden/><textarea rows="1" value={input} onChange={e=>setInput(e.target.value)} placeholder={acp.status==='online'?'输入问题，或拍照上传题目…':'正在等待 ACP 连接…'} disabled={acp.status!=='online'||acp.loading} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}/><button className="send-btn" onClick={send} disabled={acp.status!=='online'||acp.loading}><Send size={18}/></button></div><small><Camera size={13}/> 图片将通过 ACP 发送给当前项目中的 Claude Code</small></div>
  </div>;
}

function InsightsPage({ go }) { return <div className="page insights-page"><Header title="知识画像" back onBack={()=>go('home')}/><div className="insight-summary"><div><p>综合掌握度</p><strong>64<small>%</small></strong><span><ArrowRight size={13}/> 较上周提升 6%</span></div><div className="radar"><ResponsiveContainer width="100%" height={180}><RadarChart data={mastery} outerRadius="68%"><PolarGrid stroke="#dce7e1"/><PolarAngleAxis dataKey="subject" tick={{fontSize:10,fill:'#64736b'}}/><Radar dataKey="value" stroke="#28745d" fill="#4c9b81" fillOpacity={.34}/></RadarChart></ResponsiveContainer></div></div>
    <div className="section-title"><div><h3>正确率趋势</h3><p>最近 7 天练习表现</p></div><b className="up">+12%</b></div><section className="trend-card"><ResponsiveContainer width="100%" height={155}><AreaChart data={trend} margin={{top:10,right:8,left:-20,bottom:0}}><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2c7a62" stopOpacity=".28"/><stop offset="1" stopColor="#2c7a62" stopOpacity="0"/></linearGradient></defs><Tooltip/><Area type="monotone" dataKey="v" stroke="#2c7a62" strokeWidth={3} fill="url(#area)"/></AreaChart></ResponsiveContainer></section>
    <div className="section-title"><div><h3>知识点掌握</h3><p>按考纲模块统计</p></div></div><section className="mastery-list">{mastery.sort((a,b)=>a.value-b.value).map(x=><div key={x.subject}><span>{x.subject}</span><i><em style={{width:`${x.value}%`}}/></i><b className={x.value<55?'low':''}>{x.value}%</b></div>)}</section>
  </div> }

function MistakesPage({ go, wrongIds, setWrongIds }) { const list=questions.filter(q=>wrongIds.includes(q.id)); return <div className="page simple-page"><Header title="我的错题" back onBack={()=>go('home')}/><div className="filter-row"><button className="active">全部 {list.length}</button><button>待复习</button><button>已掌握</button></div>{list.length?<div className="mistake-list">{list.map(q=><article key={q.id}><div><span>{q.source}</span><button onClick={()=>setWrongIds(wrongIds.filter(x=>x!==q.id))}><BookmarkCheck size={19}/></button></div><h3>{q.title}</h3><footer><span>{q.topic}</span><button onClick={()=>go('practice')}>再做一次 <ChevronRight size={15}/></button></footer></article>)}</div>:<div className="empty"><div><BookmarkCheck size={34}/></div><h3>还没有错题</h3><p>答错的题会自动收录在这里</p><button onClick={()=>go('practice')}>去刷真题</button></div>}</div> }

function ProfilePage({ go, wrongCount }) { return <div className="page profile-page"><Header title="我的学习"/><section className="profile-card"><div className="profile-avatar">L</div><div><h2>准架构师</h2><p>目标：2026 年下半年系统架构设计师</p></div><span>备考中</span></section><div className="profile-stats"><div><b>6</b><small>连续学习/天</small></div><div><b>76%</b><small>练习正确率</small></div><div><b>{wrongCount}</b><small>待复习错题</small></div></div><h3 className="group-title">学习分析</h3><div className="menu-list"><button onClick={()=>go('insights')}><span className="green"><BarChart3/></span><p><b>知识画像</b><small>掌握度与薄弱项分析</small></p><ChevronRight/></button><button onClick={()=>go('mistakes')}><span className="orange"><BookmarkCheck/></span><p><b>错题本</b><small>针对性复习与重做</small></p><ChevronRight/></button><button><span className="blue"><Clock3/></span><p><b>学习记录</b><small>练习历史与用时统计</small></p><ChevronRight/></button></div><h3 className="group-title">备考设置</h3><div className="menu-list"><button><span className="purple"><Target/></span><p><b>考试目标</b><small>2026-10-24 · 广东</small></p><ChevronRight/></button><button><span className="gray"><RotateCcw/></span><p><b>复习偏好</b><small>严格评分 · 优先可核验真题</small></p><ChevronRight/></button></div></div> }

function Nav({ current, go }) { const items=[['home',Home,'首页'],['practice',BookOpen,'刷题'],['chat',MessageCircle,'AI 助手'],['profile',CircleUserRound,'我的']]; return <nav className="bottom-nav">{items.map(([id,Icon,label])=><button key={id} className={current===id?'active':''} onClick={()=>go(id)}><Icon size={22}/><span>{label}</span></button>)}</nav> }

function App(){ const [page,setPage]=useState('home'); const [wrongIds,setWrongIds]=useStored('rk_wrong',['2024-2-13','2023-2-18']); const [done,setDone]=useStored('rk_done',18); const acp=useAcp(); const root=['home','practice','chat','profile'].includes(page); return <main className="app-shell"><div className="phone"><div className="content">{page==='home'&&<HomePage go={setPage} stats={{mistakes:wrongIds.length,done}}/>}{page==='practice'&&<PracticePage go={setPage} wrongIds={wrongIds} setWrongIds={setWrongIds} done={done} setDone={setDone}/>} {page==='chat'&&<ChatPage acp={acp}/>} {page==='insights'&&<InsightsPage go={setPage}/>} {page==='mistakes'&&<MistakesPage go={setPage} wrongIds={wrongIds} setWrongIds={setWrongIds}/>} {page==='profile'&&<ProfilePage go={setPage} wrongCount={wrongIds.length}/>}</div>{root&&<Nav current={page} go={setPage}/>}</div></main>}

createRoot(document.getElementById('root')).render(<App/>);

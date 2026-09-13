import React, { useState } from 'react';
import { ArrowRight, MessageCircle, Send, Sparkles } from 'lucide-react';

const DEFAULT_SUGGESTIONS = ['为什么其他选项不对？', '换一种更容易理解的方式', '结合实际项目举个例子'];

export default function FollowUpPanel({
  context,
  session,
  onAsk,
  Markdown,
  suggestions = DEFAULT_SUGGESTIONS,
}) {
  const [draft, setDraft] = useState('');
  const turns = session?.items || [];
  const busy = Boolean(session?.loading);
  const submit = text => {
    const message = String(text ?? draft).trim();
    if (!message || busy) return;
    setDraft('');
    onAsk(context, message, turns);
  };
  return (
    <section className="follow-up">
      <div className="follow-up-head">
        <div className="follow-up-title">
          <span><MessageCircle size={16}/></span>
          <div><b>继续追问</b><small>不懂的地方，问到明白为止</small></div>
        </div>
        {turns.length > 0 && <span className="follow-up-count">{Math.ceil(turns.length / 2)} 次追问</span>}
      </div>
      {turns.length === 0 && suggestions.length > 0 && (
        <div className="follow-up-suggestions">
          {suggestions.map(text => (
            <button key={text} onClick={() => submit(text)} disabled={busy}>{text}<ArrowRight size={13}/></button>
          ))}
        </div>
      )}
      {turns.length > 0 && (
        <div className="follow-up-thread">
          {turns.map((turn, i) => turn.role === 'user'
            ? <div className="follow-up-user" key={i}>{turn.content}</div>
            : (
              <div className="follow-up-answer" key={i}>
                <span><Sparkles size={13}/></span>
                {turn.content
                  ? <Markdown content={turn.content} className="follow-up-markdown"/>
                  : <div className="follow-up-dots"><i/><i/><i/></div>}
              </div>
            ))}
        </div>
      )}
      {session?.error && <p className="follow-up-error">{session.error}</p>}
      <div className="follow-up-composer">
        <textarea
          value={draft}
          maxLength={2000}
          rows={1}
          placeholder="例如：这个知识点在项目中怎么用？"
          disabled={busy}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="follow-up-send" aria-label="发送追问" disabled={!draft.trim() || busy} onClick={() => submit()}>
          {busy ? <span className="follow-up-spinner"/> : <Send size={15}/>}
        </button>
      </div>
      <small className="follow-up-hint">Enter 发送 · Shift + Enter 换行</small>
    </section>
  );
}

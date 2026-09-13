import React, { useEffect, useId, useRef, useState } from 'react';

let mermaidReady = null;

async function getMermaid() {
  if (!mermaidReady) {
    mermaidReady = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        // 本地真题含 <br/> 等标签，需 loose；内容来自本仓库 Markdown，非用户输入。
        securityLevel: 'loose',
        flowchart: { htmlLabels: true, curve: 'basis' },
        fontFamily: 'DM Sans, Noto Sans SC, sans-serif',
      });
      return mermaid;
    });
  }
  return mermaidReady;
}

export default function MermaidBlock({ chart }) {
  const hostRef = useRef(null);
  const reactId = useId().replace(/:/g, '');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const source = String(chart || '').trim();
    if (!source) return undefined;

    (async () => {
      try {
        const mermaid = await getMermaid();
        const id = `mermaid-${reactId}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg } = await mermaid.render(id, source);
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
        setError('');
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          if (hostRef.current) hostRef.current.innerHTML = '';
        }
      }
    })();

    return () => { cancelled = true; };
  }, [chart, reactId]);

  if (error) {
    return (
      <div className="mermaid-fallback" role="alert">
        <p>流程图渲染失败，先显示源码：{error}</p>
        <pre><code>{chart}</code></pre>
      </div>
    );
  }

  return <div className="mermaid-wrap" ref={hostRef} aria-label="流程图"/>;
}

export const markdownComponents = {
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    const className = child?.props?.className || '';
    const language = (/language-([\w-]+)/.exec(className) || [])[1];
    if (language === 'mermaid') {
      const code = String(child?.props?.children ?? '').replace(/\n$/, '');
      return <MermaidBlock chart={code}/>;
    }
    return <pre>{children}</pre>;
  },
};

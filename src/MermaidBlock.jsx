import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

function MarkdownImage({ src, alt, ...props }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [originalSize, setOriginalSize] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = event => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);
  if (!src) return null;
  return <>
    {failed ? <p className="markdown-image-error">图片加载失败：<a href={src} target="_blank" rel="noopener noreferrer">打开原图</a></p> :
      <button className="markdown-image-link" type="button" onClick={() => { setOriginalSize(false); setOpen(true); }} aria-label={`放大查看：${alt || '题图'}`}>
        <img src={src} alt={alt || '题图'} loading="lazy" decoding="async" onError={() => setFailed(true)} {...props}/>
        <span>点击放大查看</span>
      </button>}
    {open && createPortal(<div className="image-viewer" role="dialog" aria-modal="true" aria-label={alt || '题图'} onClick={() => setOpen(false)}>
      <div className="image-viewer-panel" onClick={event => event.stopPropagation()}>
        <div className="image-viewer-bar"><span>{alt || '题图'}</span><div className="image-viewer-actions"><a href={src} target="_blank" rel="noopener noreferrer">单独打开</a><button type="button" onClick={() => setOriginalSize(value => !value)}>{originalSize ? '适应屏幕' : '原尺寸'}</button><button type="button" onClick={() => setOpen(false)} aria-label="关闭图片">关闭</button></div></div>
        <p className="image-viewer-hint">{originalSize ? '左右滑动可查看图片其余部分' : '整图预览；文字较小时点“原尺寸”'}</p>
        <div className={`image-viewer-scroll${originalSize ? ' is-original' : ''}`}><img src={src} alt={alt || '题图原尺寸'}/></div>
      </div>
    </div>, document.body)}
  </>;
}

export const markdownComponents = {
  img: MarkdownImage,
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

import { useEffect, useRef, useState } from 'react';
import { highlightTypeScript } from '../lib/codeHighlight';

export default function CodeFence({ source, writing = false, status = '' }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const tokens = highlightTypeScript(source);

  useEffect(() => () => {
    clearTimeout(timer.current);
  }, []);

  const showCopied = () => {
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  const copy = () => {
    if (writing || !source) return;
    const area = document.createElement('textarea');
    area.value = source;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    const pending = navigator.clipboard?.writeText?.(source);
    if (pending?.then) {
      pending.then(() => showCopied()).catch(() => {
        if (ok) showCopied();
      });
    }
    if (ok) showCopied();
  };

  return (
    <div className={`code-fence${writing ? ' is-live' : ''}`}>
      <div className="code-fence-bar">
        <span className="code-fence-lang">TypeScript</span>
        {status ? <span className="code-fence-status">{status}</span> : null}
        <button
          type="button"
          className="code-fence-copy glass-chip"
          disabled={writing || !source}
          aria-label={writing ? 'Copy TypeScript when the function is finished' : 'Copy TypeScript'}
          onClick={copy}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="code-ts">
        <code>
          {tokens.map((piece, index) => (
            <span key={index} className={piece.role === 'plain' ? undefined : `ts-${piece.role}`}>
              {piece.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

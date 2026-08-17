import { useEffect, useRef } from 'react';

export default function TokenProbabilities({ 
  probabilities, 
  position, 
  selectedToken,
  selectedLogprob,
  onMouseEnter,
  onMouseLeave 
}) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (!cardRef.current) return;

    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const padding = 12;
    const header = document.querySelector('.chat-header');
    const legend = document.querySelector('.confidence-legend');
    const form = document.querySelector('.message-form');
    const chromeBottom = (legend || header)?.getBoundingClientRect().bottom ?? 0;
    const topSafe = Math.max(padding, chromeBottom + 8);
    const bottomSafe = form
      ? form.getBoundingClientRect().top - 8
      : window.innerHeight - 80;

    // Prefer below the token so the card does not cover the header/legend.
    let top = position.y + 20;
    let left = position.x - (rect.width / 2);

    if (top + rect.height > bottomSafe) {
      top = position.y - rect.height - 8;
    }
    if (top < topSafe) {
      top = topSafe;
    }
    if (top + rect.height > bottomSafe) {
      top = Math.max(topSafe, bottomSafe - rect.height);
    }

    left = Math.max(padding, Math.min(left, viewportWidth - rect.width - padding));

    card.style.position = 'fixed';
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
    card.style.transform = 'none';
  }, [position, probabilities]);

  const ranked = Object.entries(probabilities || {}).sort((a, b) => b[1] - a[1]);
  const selectedRank = ranked.findIndex(([token]) => token === selectedToken);
  const resolvedSelectedLogprob = selectedRank >= 0
    ? ranked[selectedRank][1]
    : (typeof selectedLogprob === 'number' ? selectedLogprob : null);
  const inTopFive = selectedRank >= 0 && selectedRank < 5;
  const topEntries = ranked
    .filter(([token, logprob]) => token === selectedToken || Math.exp(logprob) * 100 >= 0.5)
    .slice(0, 5);

  if (topEntries.length === 0 && resolvedSelectedLogprob == null) {
    return null;
  }

  const getPercentage = (logprob) => {
    const percentage = Math.exp(logprob) * 100;
    if (percentage >= 10) return percentage.toFixed(1) + '%';
    if (percentage >= 1) return percentage.toFixed(2) + '%';
    if (percentage >= 0.1) return percentage.toFixed(2) + '%';
    if (percentage >= 0.01) return percentage.toFixed(3) + '%';
    if (percentage >= 0.001) return percentage.toFixed(4) + '%';
    return '<0.001%';
  };

  const formatToken = (token) => {
    if (token === ' ') return '␣';
    if (token === '\n') return '↵';
    if (token === '\t') return '→';
    return token;
  };
  
  // Define keyframes for fade-in animation
  const fadeInKeyframes = `
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  
  // Inline styles to ensure proper rendering
  const containerStyle = {
    position: 'fixed',
    backgroundColor: '#fafafa',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
    width: 'calc(100% - 32px)',
    maxWidth: '300px',
    zIndex: 1000,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    opacity: 0,
    animation: 'fadeIn 150ms ease-in forwards'
  };
  
  const headerStyle = {
    padding: '8px 16px',
    borderBottom: '1px solid #eaeaea',
    backgroundColor: '#f8f9fa',
    borderTopLeftRadius: '16px',
    borderTopRightRadius: '16px',
    display: 'flex',
    alignItems: 'center'
  };
  
  const listStyle = {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column'
  };
  
  return (
    <>
      <style>{fadeInKeyframes}</style>
      <div 
        ref={cardRef}
        className="token-probabilities-card"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={containerStyle}
      >
        <div style={headerStyle}>
          <h3 style={{ fontSize: '0.95rem', color: '#1a1a1a', margin: 0, fontWeight: 600 }}>Most likely</h3>
        </div>
        <ul style={listStyle}>
          {topEntries.map(([token, logprob], index) => {
            const isSelected = inTopFive && token === selectedToken;
            const isLast = index === topEntries.length - 1 && inTopFive;
            
            const itemStyle = {
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 16px',
              fontSize: '0.9rem',
              alignItems: 'center',
              lineHeight: 1.2,
              backgroundColor: isSelected ? '#3b82f6' : 'transparent',
              color: isSelected ? '#ffffff' : 'inherit',
              borderBottomLeftRadius: isLast ? '16px' : '0',
              borderBottomRightRadius: isLast ? '16px' : '0'
            };
            
            return (
              <li key={index} style={itemStyle}>
                <span style={{ 
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  marginRight: '16px',
                  fontSize: '0.9rem',
                  color: isSelected ? '#ffffff' : '#1a1a1a'
                }}>
                  {formatToken(token)}
                </span>
                <span style={{ 
                  fontWeight: 500,
                  fontSize: '0.9rem',
                  color: isSelected ? '#ffffff' : '#4b5563',
                  fontVariantNumeric: 'tabular-nums'
                }}>
                  {getPercentage(logprob)}
                </span>
              </li>
            );
          })}
        </ul>
        {!inTopFive && selectedToken != null && resolvedSelectedLogprob != null && (
          <div className="sampled-outside-top">
            <div className="sampled-outside-top-row">
              <span className="sampled-outside-top-token">{formatToken(selectedToken)}</span>
              <span className="sampled-outside-top-pct">{getPercentage(resolvedSelectedLogprob)}</span>
            </div>
            <p className="sampled-outside-top-note">Sampled, but not in the top 5</p>
          </div>
        )}
      </div>
    </>
  );
} 
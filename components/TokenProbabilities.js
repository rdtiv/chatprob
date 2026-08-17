import { useEffect, useRef } from 'react';

export default function TokenProbabilities({ 
  probabilities, 
  position, 
  selectedToken,
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

  if (!probabilities || Object.keys(probabilities).length === 0) {
    return null;
  }
  
  // Convert logprobs to percentages
  const getPercentage = (logprob) => {
    const percentage = Math.exp(logprob) * 100;
    if (percentage < 0.5) return '<0.5%';
    return percentage.toFixed(percentage < 10 ? 2 : 1) + '%';
  };
  
  // Format token for display - replace whitespace with visible representation
  const formatToken = (token) => {
    if (token === ' ') return '␣'; // Space
    if (token === '\n') return '↵'; // Newline
    if (token === '\t') return '→'; // Tab
    return token;
  };
  
  let sortedEntries = Object.entries(probabilities)
    .filter(([token, logprob]) => (
      token === selectedToken || Math.exp(logprob) * 100 >= 0.5
    ))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sortedEntries.length === 0) {
    sortedEntries = Object.entries(probabilities)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1);
  }
  
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
          <h3 style={{ fontSize: '0.95rem', color: '#1a1a1a', margin: 0, fontWeight: 600 }}>Top Probabilities:</h3>
        </div>
        <ul style={listStyle}>
          {sortedEntries.map(([token, logprob], index) => {
            const isSelected = token === selectedToken;
            const isLast = index === sortedEntries.length - 1;
            
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
      </div>
    </>
  );
} 
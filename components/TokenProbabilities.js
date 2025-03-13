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
    // Adjust position to prevent overflow
    if (cardRef.current) {
      const card = cardRef.current;
      const rect = card.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Calculate adjusted position
      let left = position.x;
      let top = position.y + 20; // Add some offset from cursor

      // Adjust horizontal position if needed
      if (left + rect.width > viewportWidth) {
        left = viewportWidth - rect.width - 20;
      }

      // Adjust vertical position if needed
      if (top + rect.height > viewportHeight) {
        top = position.y - rect.height - 20;
      }

      // Apply position
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    }
  }, [position]);

  if (!probabilities || Object.keys(probabilities).length === 0) {
    return null;
  }
  
  // Convert logprobs to percentages
  const getPercentage = (logprob) => {
    const percentage = Math.exp(logprob) * 100;
    return percentage < 1 ? 
      percentage.toFixed(2) + '%' : 
      percentage.toFixed(2) + '%';
  };
  
  // Format token for display - replace whitespace with visible representation
  const formatToken = (token) => {
    if (token === ' ') return '␣'; // Space
    if (token === '\n') return '↵'; // Newline
    if (token === '\t') return '→'; // Tab
    return token;
  };
  
  // Sort entries by probability (highest first) and limit to top 5
  const sortedEntries = Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
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
    left: '50%',
    transform: 'translateX(-50%)',
    margin: '0 auto',
    bottom: '140px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    animation: 'fadeIn 150ms ease-in forwards',
    height: 'fit-content' // Ensure height fits content exactly
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
              borderBottomRightRadius: isLast ? '16px' : '0',
              marginBottom: 0
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
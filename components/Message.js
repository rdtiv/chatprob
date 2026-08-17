import { useState, useRef, useEffect } from 'react';
import TokenProbabilities from './TokenProbabilities';

function sampledLogprob(tokenData) {
  if (!tokenData) return null;
  if (typeof tokenData.logprob === 'number') return tokenData.logprob;
  if (tokenData.top_logprobs && tokenData.token in tokenData.top_logprobs) {
    return tokenData.top_logprobs[tokenData.token];
  }
  return null;
}

function sampledPercentage(tokenData) {
  const logprob = sampledLogprob(tokenData);
  if (logprob == null) return null;
  return Math.exp(logprob) * 100;
}

function pickHintTokenIndex(tokenProbabilities) {
  if (!Array.isArray(tokenProbabilities) || tokenProbabilities.length === 0) return -1;

  let bestIndex = -1;
  let bestDistance = Infinity;
  tokenProbabilities.forEach((tokenData, index) => {
    if (!(tokenData.token || '').trim()) return;
    const percentage = sampledPercentage(tokenData);
    if (percentage == null) return;
    const distance = Math.abs(percentage - 55);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  if (bestIndex >= 0) return bestIndex;
  return tokenProbabilities.findIndex((tokenData) => (tokenData.token || '').trim());
}

const getBackgroundColor = (tokenData) => {
  const percentage = sampledPercentage(tokenData);
  if (percentage == null) return 'transparent';
  
  // Define color stops
  const colors = {
    high: { r: 34, g: 197, b: 94 },    // Dark green (#22C55E)
    mid: { r: 234, g: 179, b: 8 },     // Yellow (#EAB308)
    low: { r: 139, g: 0, b: 0 }        // Dark red (#8B0000)
  };
  
  let finalColor;
  if (percentage >= 50) {
    // Blend between high (100%) and mid (50%)
    const ratio = (percentage - 50) / 50; // Will be 0 at 50% and 1 at 100%
    finalColor = {
      r: Math.round(colors.mid.r + (colors.high.r - colors.mid.r) * ratio),
      g: Math.round(colors.mid.g + (colors.high.g - colors.mid.g) * ratio),
      b: Math.round(colors.mid.b + (colors.high.b - colors.mid.b) * ratio)
    };
  } else {
    // Blend between mid (50%) and low (0%)
    const ratio = percentage / 50; // Will be 0 at 0% and 1 at 50%
    finalColor = {
      r: Math.round(colors.low.r + (colors.mid.r - colors.low.r) * ratio),
      g: Math.round(colors.low.g + (colors.mid.g - colors.low.g) * ratio),
      b: Math.round(colors.low.b + (colors.mid.b - colors.low.b) * ratio)
    };
  }
  
  // Calculate opacity based on percentage (0.15 to 0.5)
  const opacity = 0.15 + (percentage / 100) * 0.35;
  
  // Return rgba color
  return `rgba(${finalColor.r}, ${finalColor.g}, ${finalColor.b}, ${opacity})`;
};

export default function Message({ message, onSelect, showHoverHint = false, onHoverUsed }) {
  const { role, completions, activeIndex = 0, content } = message;
  const [hoveredToken, setHoveredToken] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef(null);
  const completionCount = Array.isArray(completions) ? completions.length : 0;
  const safeIndex = completionCount
    ? Math.min(Math.max(activeIndex, 0), completionCount - 1)
    : 0;
  
  const markHoverUsed = () => {
    if (showHoverHint) onHoverUsed?.();
  };

  useEffect(() => {
    if (!hoveredToken) return undefined;
    const onDocPointerDown = (event) => {
      if (event.target.closest('.token') || event.target.closest('.token-probabilities-card')) {
        return;
      }
      setPinned(false);
      setHoveredToken(null);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [hoveredToken]);

  const handleTokenMouseEnter = (token, index, event) => {
    if (pinned) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    markHoverUsed();
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredToken({ token, index });
      setMousePosition({ x: event.clientX, y: event.clientY });
    }, 100);
  };

  const handleTokenClick = (token, index, event) => {
    event.preventDefault();
    markHoverUsed();
    if (pinned && hoveredToken?.index === index) {
      setPinned(false);
      setHoveredToken(null);
      return;
    }
    setPinned(true);
    setHoveredToken({ token, index });
    setMousePosition({ x: event.clientX, y: event.clientY });
  };
  
  const handleTokenMouseLeave = () => {
    if (pinned) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredToken(null);
  };

  const handleSelect = (index) => {
    if (index === safeIndex) return;
    setPinned(false);
    setHoveredToken(null);
    onSelect?.(index);
  };

  const renderContent = () => {
    // Handle non-assistant messages or messages without completions
    if (!completions || role !== 'assistant') {
      return <div className="message-text">{content}</div>;
    }

    // Add safety checks for completions array
    if (!Array.isArray(completions) || completions.length === 0) {
      return <div className="message-text">{content || 'No response available'}</div>;
    }

    const activeCompletion = completions[safeIndex];
    
    if (!activeCompletion) {
      return <div className="message-text">{content || 'No response available'}</div>;
    }

    const { text, tokenProbabilities } = activeCompletion;
    
    if (!tokenProbabilities || tokenProbabilities.length === 0) {
      return <div className="message-text">{text || content || 'No response available'}</div>;
    }
    
    const hintIndex = showHoverHint ? pickHintTokenIndex(tokenProbabilities) : -1;

    return (
      <div className="message-text">
        {tokenProbabilities.map((tp, idx) => {
          const backgroundColor = getBackgroundColor(tp);
          return (
            <span 
              key={idx}
              className={`token${idx === hintIndex ? ' token-hint' : ''}`}
              style={{ backgroundColor }}
              onMouseEnter={(e) => handleTokenMouseEnter(tp.token, idx, e)}
              onClick={(e) => handleTokenClick(tp.token, idx, e)}
              onMouseLeave={handleTokenMouseLeave}
            >
              {tp.token}
            </span>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className={`message ${role}-message`}>
      <div className="message-inner">
        <div className="message-front">
          <div className="message-header">
            {completionCount > 1 && (
              <div className="completion-tabs" role="tablist" aria-label="Alternative responses">
                {completions.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    role="tab"
                    aria-selected={index === safeIndex}
                    className={`completion-tab${index === safeIndex ? ' is-active' : ''}`}
                    onClick={() => handleSelect(index)}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
          {renderContent()}
          {(message.timestamp || message.usage) && (
            <div className="message-meta">
              {message.timestamp && (
                <span className="message-timestamp">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              )}
              {message.usage?.prompt_tokens != null && (
                <span
                  className="token-usage"
                  title="in = system instructions + the conversation so far. out = this tab. total out = every alternative sample."
                >
                  {message.usage.prompt_tokens} in
                  {completions?.[safeIndex]?.tokenProbabilities?.length
                    ? ` · ${completions[safeIndex].tokenProbabilities.length} out`
                    : ''}
                  {message.usage.completion_tokens != null
                    ? ` · ${message.usage.completion_tokens} total out`
                    : ''}
                </span>
              )}
            </div>
          )}
          {showHoverHint && (
            <div className="hover-hint">Tap or hover a highlighted word to see what else the model considered</div>
          )}
        </div>
      </div>
      {hoveredToken && completions && (
        <TokenProbabilities 
          probabilities={completions[safeIndex]?.tokenProbabilities[hoveredToken.index]?.top_logprobs || {}}
          position={mousePosition}
          selectedToken={hoveredToken.token}
          onMouseEnter={() => clearTimeout(hoverTimeoutRef.current)}
          onMouseLeave={handleTokenMouseLeave}
        />
      )}
    </div>
  );
} 
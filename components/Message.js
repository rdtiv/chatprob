import { useState, useRef } from 'react';
import TokenProbabilities from './TokenProbabilities';

// Utility function to calculate background color based on probability
const getBackgroundColor = (tokenData) => {
  if (!tokenData || !tokenData.top_logprobs) return 'transparent';
  
  // Get the probability for this token (it's the highest probability in top_logprobs)
  const highestLogprob = Math.max(...Object.values(tokenData.top_logprobs));
  
  // Convert logprob to percentage
  const percentage = Math.exp(highestLogprob) * 100;
  
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

export default function Message({ message, onToggle }) {
  const { role, completions, activeIndex = 0 } = message;
  const [hoveredToken, setHoveredToken] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef(null);
  
  const handleTokenMouseEnter = (token, index, event) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredToken({ token, index });
      setMousePosition({ x: event.clientX, y: event.clientY });
    }, 100);
  };
  
  const handleTokenMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredToken(null);
  };
  
  const renderContent = () => {
    if (!completions || role !== 'assistant') {
      return <div className="message-text">{message.content}</div>;
    }

    const activeCompletion = completions[activeIndex];
    const { text, tokenProbabilities } = activeCompletion;
    
    if (!tokenProbabilities || tokenProbabilities.length === 0) {
      return <div className="message-text">{text}</div>;
    }
    
    return (
      <div className="message-text">
        {tokenProbabilities.map((tp, idx) => {
          const backgroundColor = getBackgroundColor(tp);
          return (
            <span 
              key={idx}
              className="token"
              style={{ backgroundColor }}
              onMouseEnter={(e) => handleTokenMouseEnter(tp.token, idx, e)}
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
      <div className="message-header">
        <div className="message-role">{role === 'user' ? 'You' : 'AI'}</div>
        {completions && completions.length > 1 && (
          <button 
            onClick={onToggle}
            className="toggle-completion-button"
            title="Show alternative response"
          >
            <span className="toggle-icon">↻</span>
            <span className="completion-counter">{activeIndex + 1}/{completions.length}</span>
          </button>
        )}
      </div>
      {renderContent()}
      {message.timestamp && (
        <div className="message-timestamp">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      )}
      {hoveredToken && completions && (
        <TokenProbabilities 
          probabilities={completions[activeIndex].tokenProbabilities[hoveredToken.index]?.top_logprobs || {}}
          position={mousePosition}
          selectedToken={hoveredToken.token}
          onMouseEnter={() => clearTimeout(hoverTimeoutRef.current)}
          onMouseLeave={handleTokenMouseLeave}
        />
      )}
    </div>
  );
} 
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
  
  // Sort entries by probability (highest first) and limit to top 5
  const sortedEntries = Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  return (
    <div 
      className="token-probabilities-hover"
      ref={cardRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="probabilities-header">
        <h3>Top Probabilities:</h3>
      </div>
      <ul className="probabilities-list">
        {sortedEntries.map(([token, logprob], index) => (
          <li 
            key={index} 
            className={token === selectedToken ? 'probability-item selected' : 'probability-item'}
          >
            <span className="token-text">{token}</span>
            <span className="token-percentage">{getPercentage(logprob)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
} 
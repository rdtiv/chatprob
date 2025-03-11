export default function TokenProbabilities({ probabilities, onClose }) {
  if (!probabilities || probabilities.length === 0) {
    return (
      <div className="token-probabilities">
        <div className="probabilities-header">
          <h3>Top Probabilities</h3>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        <div className="no-probabilities">No probability data available.</div>
      </div>
    );
  }
  
  // Convert logprobs to percentages
  const getPercentage = (logprob) => {
    return (Math.exp(logprob) * 100).toFixed(2) + '%';
  };
  
  return (
    <div className="token-probabilities">
      <div className="probabilities-header">
        <h3>Top Probabilities:</h3>
        <button onClick={onClose} className="close-button">×</button>
      </div>
      <ul className="probabilities-list">
        {Object.entries(probabilities).map(([token, logprob], index) => (
          <li 
            key={index} 
            className={index === 0 ? 'probability-item selected' : 'probability-item'}
          >
            <span className="token-text">{token}</span>
            <span className="token-percentage">{getPercentage(logprob)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
} 
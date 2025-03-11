import { useState } from 'react';

export default function Message({ message, onTokenClick }) {
  const { role, content, tokenProbabilities } = message;
  
  // Render content with actual tokens if we have probability data
  const renderContent = () => {
    if (!tokenProbabilities || role !== 'assistant' || tokenProbabilities.length === 0) {
      return <div className="message-text">{content}</div>;
    }
    
    // Render the actual tokens from the API response
    return (
      <div className="message-text">
        {tokenProbabilities.map((tp, idx) => (
          <span 
            key={idx}
            className="token"
            onClick={() => onTokenClick(tp.token, idx)}
          >
            {tp.token}
          </span>
        ))}
      </div>
    );
  };
  
  return (
    <div className={`message ${role}-message`}>
      <div className="message-role">{role === 'user' ? 'You' : 'AI'}</div>
      {renderContent()}
      {message.timestamp && (
        <div className="message-timestamp">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
} 
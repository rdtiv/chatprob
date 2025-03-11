import { useState } from 'react';

export default function Message({ message, onTokenClick }) {
  const { role, content, tokenProbabilities } = message;
  
  // Split content into tokens if we have probability data
  const renderContent = () => {
    if (!tokenProbabilities || role !== 'assistant') {
      return <div className="message-text">{content}</div>;
    }
    
    // Render clickable tokens
    return (
      <div className="message-text">
        {content.split(' ').map((word, idx) => (
          <span 
            key={idx}
            className="token"
            onClick={() => onTokenClick(word, idx)}
          >
            {word}{' '}
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
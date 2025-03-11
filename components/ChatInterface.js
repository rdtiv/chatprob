import { useState, useRef, useEffect } from 'react';
import Message from './Message';
import TokenProbabilities from './TokenProbabilities';

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTokenProbs, setCurrentTokenProbs] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentMessage.trim()) return;

    const userMessage = { role: 'user', content: currentMessage };
    setMessages([...messages, userMessage]);
    setCurrentMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: currentMessage }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      
      const aiMessage = { 
        role: 'assistant', 
        content: data.text,
        tokenProbabilities: data.tokenProbabilities 
      };
      
      setMessages(prev => [...prev, aiMessage]);
      setCurrentTokenProbs(data.tokenProbabilities);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, there was an error processing your request.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTokenClick = (token, index) => {
    setSelectedToken({ token, index });
  };

  return (
    <div className="chat-container">
      <div className="messages-container">
        {messages.map((message, index) => (
          <Message 
            key={index} 
            message={message} 
            onTokenClick={handleTokenClick}
          />
        ))}
        {isLoading && <div className="loading-indicator">OpenAI is thinking...</div>}
        <div ref={messagesEndRef} />
      </div>
      
      {selectedToken && (
        <TokenProbabilities 
          probabilities={currentTokenProbs[selectedToken.index]?.top_logprobs || []} 
          onClose={() => setSelectedToken(null)}
        />
      )}
      
      <form onSubmit={handleSubmit} className="message-form">
        <input
          type="text"
          value={currentMessage}
          onChange={(e) => setCurrentMessage(e.target.value)}
          placeholder="Type your message..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>Send</button>
      </form>
    </div>
  );
} 
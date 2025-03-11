import { useState, useRef, useEffect } from 'react';
import Message from './Message';

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
      
      // Add timestamp to the message
      const timestamp = new Date().toISOString();
      
      const aiMessage = { 
        role: 'assistant', 
        content: data.text,
        tokenProbabilities: data.tokenProbabilities,
        timestamp: timestamp
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, there was an error processing your request.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>OpenAI Chat</h2>
      </div>
      <div className="messages-container">
        {messages.map((message, index) => (
          <Message 
            key={index} 
            message={message}
          />
        ))}
        {isLoading && <div className="loading-indicator">OpenAI is thinking...</div>}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="message-form">
        <input
          type="text"
          value={currentMessage}
          onChange={(e) => setCurrentMessage(e.target.value)}
          placeholder="Type your message..."
          disabled={isLoading}
          className="message-input"
        />
        <button type="submit" disabled={isLoading} className="send-button">
          Send
        </button>
      </form>
    </div>
  );
} 
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

  // Load messages from localStorage on component mount
  useEffect(() => {
    const savedMessages = localStorage.getItem('chatMessages');
    if (savedMessages) {
      setMessages(JSON.parse(savedMessages));
    }
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('chatMessages', JSON.stringify(messages));
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentMessage.trim()) return;

    const userMessage = { 
      role: 'user', 
      content: currentMessage,
      timestamp: new Date().toISOString()
    };
    
    // Lock in the active completion for the previous assistant message if it exists
    const updatedMessages = messages.map(msg => {
      if (msg.role === 'assistant' && msg.completions) {
        // Keep only the selected completion
        return {
          ...msg,
          completions: [msg.completions[msg.activeIndex || 0]]
        };
      }
      return msg;
    });
    
    const messagesForAPI = [...updatedMessages, userMessage];
    setMessages(messagesForAPI);
    setCurrentMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: messagesForAPI }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      
      const aiMessage = { 
        role: 'assistant', 
        completions: data.completions,
        activeIndex: 0,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        completions: [{
          text: 'Sorry, there was an error processing your request.',
          tokenProbabilities: []
        }],
        activeIndex: 0,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCompletion = (messageIndex) => {
    setMessages(prev => prev.map((msg, idx) => {
      if (idx === messageIndex && msg.completions && msg.completions.length > 1) {
        return {
          ...msg,
          activeIndex: (msg.activeIndex + 1) % msg.completions.length
        };
      }
      return msg;
    }));
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem('chatMessages');
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>OpenAI Chat</h2>
        <button onClick={clearChat} className="clear-chat-button">
          Clear Chat
        </button>
      </div>
      <div className="messages-container">
        {messages.map((message, index) => (
          <Message 
            key={index}
            message={message}
            onToggle={() => message.completions?.length > 1 && toggleCompletion(index)}
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
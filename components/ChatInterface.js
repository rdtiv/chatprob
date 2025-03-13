import { useState, useRef, useEffect } from 'react';
import Message from './Message';

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Update page title
  useEffect(() => {
    document.title = 'ChatProb';
  }, []);

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
    if (!currentMessage.trim() || isLoading) return;

    const userMessage = { role: 'user', content: currentMessage, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev.map(msg => ({
      ...msg,
      content: msg.completions ? msg.completions[msg.activeIndex || 0] : msg.content
    })), userMessage]);
    setCurrentMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage]
        })
      });

      if (!response.ok) throw new Error('Response was not ok');
      const data = await response.json();
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.completions[0],
        completions: data.completions,
        activeIndex: 0,
        timestamp: new Date().toISOString()
      }]);
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: '100%',
      height: '100%',
      backgroundColor: '#fff',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      <h1 style={{ 
        margin: '20px 0',
        fontSize: '24px',
        fontWeight: '600',
        color: '#3b82f6',
        display: 'none'
      }} className="desktop-only">ChatProb</h1>
      <div className="chat-container" style={{
        maxWidth: '800px',
        width: '100%',
        height: 'calc(100% - 80px)',
        margin: '0 auto'
      }}>
        <div className="chat-header">
          <h3 style={{ margin: 0 }}>Explore Token Probabilities & Alternative Responses</h3>
          <button 
            onClick={clearChat} 
            className="refresh-button"
            title="Clear chat history"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
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
          {isLoading && (
            <div style={{
              display: 'flex',
              justifyContent: 'flex-start',
              padding: '12px 16px',
              marginTop: '8px'
            }}>
              <div style={{
                display: 'flex',
                gap: '4px',
                alignItems: 'center'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  backgroundColor: '#94a3b8',
                  borderRadius: '50%',
                  animation: 'pulse 1s infinite ease-in-out',
                  animationDelay: '0s'
                }}></span>
                <span style={{
                  width: '6px',
                  height: '6px',
                  backgroundColor: '#94a3b8',
                  borderRadius: '50%',
                  animation: 'pulse 1s infinite ease-in-out',
                  animationDelay: '0.2s'
                }}></span>
                <span style={{
                  width: '6px',
                  height: '6px',
                  backgroundColor: '#94a3b8',
                  borderRadius: '50%',
                  animation: 'pulse 1s infinite ease-in-out',
                  animationDelay: '0.4s'
                }}></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <form onSubmit={handleSubmit} className="message-form">
          <div style={{
            position: 'relative',
            width: '100%',
            display: 'flex'
          }}>
            <input
              type="text"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              className="message-input"
            />
            <button 
              type="submit" 
              disabled={isLoading} 
              className="send-button"
              aria-label="Send message"
            >
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 
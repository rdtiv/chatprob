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

  // Detect iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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

  // Add viewport height effect for iOS Safari
  useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    setVh();
    window.addEventListener('resize', setVh);
    return () => window.removeEventListener('resize', setVh);
  }, []);

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
      if (isIOS) {
        // For iOS, skip streaming and get final response directly
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
      } else {
        // For non-iOS, use streaming
        const streamResponse = await fetch('/api/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMessage]
          })
        });

        const stream = await streamResponse;
        if (!stream.ok) throw new Error('Stream response was not ok');
        
        const reader = stream.body.getReader();
        const decoder = new TextDecoder();
        let streamedContent = '';

        // Add the assistant message only when we get the first chunk
        let assistantMessageAdded = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            streamedContent += chunk;

            if (!assistantMessageAdded) {
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: streamedContent,
                timestamp: new Date().toISOString()
              }]);
              assistantMessageAdded = true;
            } else {
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  ...newMessages[newMessages.length - 1],
                  content: streamedContent
                };
                return newMessages;
              });
            }
          }
        } finally {
          reader.releaseLock();
        }

        // Get probability data after streaming
        const probResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMessage]
          })
        });

        const probData = await probResponse.json();
        
        // Update the message with probability data
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          newMessages[newMessages.length - 1] = {
            ...lastMessage,
            completions: probData.completions,
            activeIndex: 0
          };
          return newMessages;
        });
      }
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
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      backgroundColor: isIOS ? '#fff' : '#f5f5f5',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
      paddingTop: isIOS ? 'env(safe-area-inset-top)' : 0
    }}>
      <div className="chat-container" style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        width: '100%',
        maxWidth: isIOS ? '100%' : '800px',
        overflowY: 'hidden',
        backgroundColor: '#fff',
        marginTop: 0,
        ...(isIOS ? {} : { 
          boxShadow: '0 0 20px rgba(0,0,0,0.1)',
          margin: 'auto',
          borderRadius: '10px',
          height: '70vh',
          maxHeight: '700px'
        })
      }}>
        <div className="chat-header" style={{
          padding: '1rem',
          paddingTop: isIOS ? '0.5rem' : '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid #eee',
          backgroundColor: '#fff',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}>
          <h3 style={{ margin: 0 }}>Explore Token Probabilities & Alternative Responses</h3>
          <button 
            onClick={clearChat} 
            className="refresh-button"
            title="Clear chat history"
            style={{ padding: '0.5rem' }}
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
        <div className="messages-container" style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: isIOS ? 'calc(1rem + 80px)' : '1rem'
        }}>
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
        
        <form onSubmit={handleSubmit} className="message-form" style={{
          padding: '0.75rem 1rem',
          paddingBottom: isIOS ? 'calc(0.75rem + env(safe-area-inset-bottom))' : '0.75rem',
          borderTop: '1px solid #eee',
          backgroundColor: '#fff',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
          display: 'flex',
          gap: '0.5rem',
          flexShrink: 0,
          zIndex: 2
        }}>
          <div style={{
            position: 'relative',
            width: '100%'
          }}>
            <input
              type="text"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              className="message-input"
              style={{
                width: '100%',
                padding: '0.75rem',
                paddingRight: '2.5rem',
                borderRadius: '12px',
                border: '1px solid #ddd',
                fontSize: '16px',
                backgroundColor: '#f8f9fa',
                transition: 'all 0.2s ease'
              }}
            />
            <button 
              type="submit" 
              disabled={isLoading} 
              className="send-button"
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '6px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'transparent',
                color: isLoading ? '#94a3b8' : '#2563eb',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
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
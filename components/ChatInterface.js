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
    if (!currentMessage.trim() || isLoading) return;

    const userMessage = { role: 'user', content: currentMessage, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev.map(msg => ({
      ...msg,
      content: msg.completions ? msg.completions[msg.activeIndex || 0] : msg.content
    })), userMessage]);
    setCurrentMessage('');
    setIsLoading(true);

    try {
      // Start streaming response immediately
      const streamResponse = await fetch('/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage]
        })
      });

      // Start probability request in parallel
      const probResponse = fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage]
        })
      });

      // Add initial empty assistant message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString()
      }]);

      // Handle streaming response
      const stream = await streamResponse;
      if (!stream.ok) throw new Error('Stream response was not ok');
      
      const reader = stream.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Handle both string and Uint8Array responses
          const chunk = typeof value === 'string' ? value : decoder.decode(value, { stream: true });
          streamedContent += chunk;

          // Update the last message with streamed content
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              ...newMessages[newMessages.length - 1],
              content: streamedContent
            };
            return newMessages;
          });
        }
      } finally {
        reader.releaseLock();
      }

      // Once streaming is done, get probability data
      const probData = await (await probResponse).json();
      
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
    <div className="chat-container">
      <div className="chat-header">
        <h3>Token Probability Explorer & Alternative Messages</h3>
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
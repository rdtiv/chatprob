import { useState, useRef, useEffect } from 'react';
import Message from './Message';
import ConversationExplainer from './ConversationExplainer';

const STARTER_PROMPTS = [
  'The best pizza topping is',
  'Write two different metaphors for rain.',
  'Yes or no: is a hot dog a sandwich?',
];

const HOVER_HINT_KEY = 'chatprobHoverHintSeen';

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [temperature, setTemperature] = useState(1.2);
  const [hoverHintVisible, setHoverHintVisible] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const messagesEndRef = useRef(null);
  const inFlightRef = useRef(false);

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

  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem('chatMessages');
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
      setHoverHintVisible(localStorage.getItem(HOVER_HINT_KEY) !== '1');
    } catch (error) {
      console.error('Could not read saved chat:', error);
    }
    setStorageReady(true);
  }, []);

  const dismissHoverHint = () => {
    setHoverHintVisible(false);
    localStorage.setItem(HOVER_HINT_KEY, '1');
  };

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem('chatMessages', JSON.stringify(messages));
    } catch (error) {
      console.error('Could not save chat:', error);
    }
  }, [messages, storageReady]);

  const sendMessage = async (text) => {
    const content = (text ?? currentMessage).trim();
    if (!content || inFlightRef.current) return;

    inFlightRef.current = true;
    const userMessage = { role: 'user', content, timestamp: new Date().toISOString() };
    const conversation = [...messages, userMessage];
    setMessages(conversation);
    setCurrentMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation, temperature })
      });

      if (!response.ok) throw new Error('Response was not ok');
      const data = await response.json();
      const first = data.completions?.[0];

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: first?.text || '',
        completions: data.completions,
        activeIndex: 0,
        timestamp: new Date().toISOString(),
        usage: data.usage || null
      }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, there was an error processing your request.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await sendMessage(currentMessage);
  };

  const selectCompletion = (messageIndex, completionIndex) => {
    setMessages(prev => prev.map((msg, idx) => {
      if (idx !== messageIndex || !msg.completions?.[completionIndex]) return msg;
      return {
        ...msg,
        activeIndex: completionIndex,
        content: msg.completions[completionIndex]?.text ?? msg.content
      };
    }));
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem('chatMessages');
  };

  const firstHintableIndex = messages.findIndex((item) => (
    item.role === 'assistant' &&
    item.completions?.some((completion) => completion.tokenProbabilities?.length)
  ));

  const turnBilled = (item) => {
    if (item.role !== 'assistant' || item.usage?.prompt_tokens == null) return 0;
    return (item.usage.prompt_tokens || 0) + (item.usage.completion_tokens || 0);
  };

  const sessionSeries = [];
  const inSeries = [];
  messages.reduce((running, item) => {
    const next = running + turnBilled(item);
    if (item.role === 'assistant' && item.usage?.prompt_tokens != null) {
      sessionSeries.push(next);
      inSeries.push(item.usage.prompt_tokens);
    }
    return next;
  }, 0);
  const sessionBilled = sessionSeries[sessionSeries.length - 1] || 0;

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
        height: '100%',
        margin: '0 auto'
      }}>
        <div className="chat-header">
          <h3 style={{ margin: 0 }}>
            <span className="title-full">Explore Token Probabilities & Alternative Responses</span>
            <span className="title-short">ChatProb</span>
          </h3>
          <div className="header-actions">
            <label className="sampling-control" title="Higher temperature samples more freely. Hover colors still show raw model confidence.">
              <span>Temp {temperature.toFixed(1)}</span>
              <input
                type="range"
                min="0.2"
                max="1.8"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                aria-label="Sampling temperature"
              />
            </label>
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
        </div>
        <div className="confidence-legend">
          <span className="legend-item">
            <span className="legend-swatch legend-swatch-high" />
            more sure
          </span>
          <span className="legend-item">
            <span className="legend-swatch legend-swatch-mid" />
            mixed
          </span>
          <span className="legend-item">
            <span className="legend-swatch legend-swatch-low" />
            less sure
          </span>
          <span className="legend-hover">Tap or hover a word for the other choices</span>
        </div>
        {sessionBilled > 0 && (
          <div className="conversation-lesson">
            <div className="conversation-lesson-row">
              <span className="conversation-lesson-label">Prompt this turn</span>
              <span className="conversation-lesson-values">{inSeries.join(' → ')} in</span>
            </div>
            <div className="conversation-lesson-row">
              <span className="conversation-lesson-label">Paid so far</span>
              <span className="conversation-lesson-values">{sessionSeries.join(' → ')} billed</span>
            </div>
            <ConversationExplainer
              inSeries={inSeries}
              sessionSeries={sessionSeries}
              lastAssistant={[...messages].reverse().find((item) => item.role === 'assistant' && item.usage)}
              messages={messages}
            />
          </div>
        )}
        <div className="messages-container">
          {messages.length === 0 && !isLoading && (
            <div className="empty-start">
              <ConversationExplainer inSeries={[]} sessionSeries={[]} lastAssistant={null} />
              <div className="prompt-chips" aria-label="Starter prompts">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="prompt-chip"
                    disabled={isLoading}
                    onClick={() => sendMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => {
            const billedThrough = messages
              .slice(0, index + 1)
              .reduce((sum, item) => sum + turnBilled(item), 0);
            const previousIn = [...messages.slice(0, index)]
              .reverse()
              .find((item) => item.role === 'assistant' && item.usage?.prompt_tokens != null)
              ?.usage?.prompt_tokens;
            const thisIn = message.usage?.prompt_tokens;
            const replayedIn = Number.isFinite(previousIn) ? previousIn : null;
            const addedIn = Number.isFinite(thisIn) && Number.isFinite(previousIn)
              ? Math.max(0, thisIn - previousIn)
              : null;
            return (
            <Message 
              key={index}
              message={message}
              onSelect={(completionIndex) => selectCompletion(index, completionIndex)}
              showHoverHint={hoverHintVisible && index === firstHintableIndex}
              onHoverUsed={dismissHoverHint}
              sessionBilled={message.role === 'assistant' ? billedThrough : null}
              replayedIn={message.role === 'assistant' ? replayedIn : null}
              addedIn={message.role === 'assistant' ? addedIn : null}
            />
            );
          })}
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
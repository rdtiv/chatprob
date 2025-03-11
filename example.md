// Project structure:
//
// chatprob/
// ├── .env.local              # Environment variables
// ├── package.json            # Project dependencies
// ├── next.config.js          # Next.js configuration
// ├── pages/
// │   ├── _app.js             # Custom App component
// │   ├── api/
// │   │   └── chat.js         # OpenAI API endpoint
// │   └── index.js            # Main chat interface
// ├── components/
// │   ├── ChatInterface.js    # Chat UI component
// │   ├── Message.js          # Message component
// │   └── TokenProbabilities.js # Token probabilities component
// └── styles/
//     └── globals.css         # Global styles

// File: package.json
{
  "name": "chatprob",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "12.3.4",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "openai": "^4.10.0"
  },
  "devDependencies": {
    "eslint": "8.45.0",
    "eslint-config-next": "13.4.12"
  }
}

// File: next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
}

module.exports = nextConfig

// File: .env.local
// This file should be created manually with your OpenAI API key
OPENAI_API_KEY=your_openai_api_key_here

// File: pages/_app.js
import '../styles/globals.css'

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp

// File: pages/api/chat.js
import { OpenAI } from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message } = req.body;
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: message }],
      temperature: 0.7,
      max_tokens: 150,
      logprobs: true,
      top_logprobs: 5,
    });

    // Extract token probabilities
    const tokenProbabilities = response.choices[0].logprobs?.content || [];
    
    return res.status(200).json({
      text: response.choices[0].message.content,
      tokenProbabilities: tokenProbabilities
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return res.status(500).json({ error: 'Error communicating with OpenAI' });
  }
}

// File: pages/index.js
import { useState } from 'react'
import Head from 'next/head'
import ChatInterface from '../components/ChatInterface'

export default function Home() {
  return (
    <div>
      <Head>
        <title>ChatProb - OpenAI Chat with Token Probabilities</title>
        <meta name="description" content="Chat with OpenAI and see token probabilities" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className="app-title">ChatProb</h1>
        <p className="app-subtitle">Chat with OpenAI and see token probabilities</p>
        <ChatInterface />
      </main>
    </div>
  )
}

// File: components/ChatInterface.js
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

// File: components/Message.js
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

// File: components/TokenProbabilities.js
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

// File: styles/globals.css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #f5f5f5;
}

main {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.app-title {
  text-align: center;
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
  color: #2563eb;
}

.app-subtitle {
  text-align: center;
  color: #666;
  margin-bottom: 2rem;
}

.chat-container {
  background-color: white;
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 80vh;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.message {
  margin-bottom: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  max-width: 80%;
  position: relative;
}

.user-message {
  background-color: #e9f5ff;
  align-self: flex-end;
  margin-left: auto;
}

.assistant-message {
  background-color: #f0f0f0;
  align-self: flex-start;
}

.message-role {
  font-weight: bold;
  font-size: 0.8rem;
  margin-bottom: 4px;
  color: #666;
}

.message-text {
  word-wrap: break-word;
}

.message-timestamp {
  font-size: 0.7rem;
  color: #999;
  text-align: right;
  margin-top: 4px;
}

.token {
  cursor: pointer;
  position: relative;
}

.token:hover {
  background-color: rgba(37, 99, 235, 0.1);
  border-radius: 2px;
}

.message-form {
  display: flex;
  padding: 12px;
  border-top: 1px solid #eaeaea;
}

.message-form input {
  flex: 1;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.message-form button {
  padding: 0 20px;
  background-color: #2563eb;
  color: white;
  border: none;
  border-radius: 4px;
  margin-left: 8px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
}

.message-form button:disabled {
  background-color: #93c5fd;
  cursor: not-allowed;
}

.loading-indicator {
  text-align: center;
  color: #666;
  font-style: italic;
  margin: 10px 0;
}

.token-probabilities {
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  width: 300px;
  position: absolute;
  right: 20px;
  bottom: 100px;
  z-index: 10;
}

.probabilities-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #eaeaea;
}

.probabilities-header h3 {
  font-size: 1rem;
  color: #333;
  margin: 0;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #666;
}

.probabilities-list {
  list-style-type: none;
  padding: 8px 0;
  max-height: 300px;
  overflow-y: auto;
}

.probability-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 16px;
  font-size: 0.9rem;
}

.probability-item.selected {
  background-color: #3b82f6;
  color: white;
}

.token-text {
  font-family: monospace;
}

.token-percentage {
  font-weight: 500;
}

.no-probabilities {
  padding: 16px;
  text-align: center;
  color: #666;
  font-style: italic;
}

@media (max-width: 768px) {
  .chat-container {
    height: 90vh;
  }
  
  .message {
    max-width: 90%;
  }
  
  .token-probabilities {
    width: 280px;
    right: 10px;
    bottom: 80px;
  }
}
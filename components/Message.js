import { useState, useRef, useEffect, useMemo } from 'react';
import TokenProbabilities from './TokenProbabilities';
import { tokenizeForDisplay, isPartialChunk } from '../lib/tokenizer';

const EMPTY_TOP_LOGPROBS = {};

function sampledLogprob(tokenData) {
  if (!tokenData) return null;
  if (typeof tokenData.logprob === 'number') return tokenData.logprob;
  if (tokenData.top_logprobs && tokenData.token in tokenData.top_logprobs) {
    return tokenData.top_logprobs[tokenData.token];
  }
  return null;
}

function sampledPercentage(tokenData) {
  const logprob = sampledLogprob(tokenData);
  if (logprob == null) return null;
  return Math.exp(logprob) * 100;
}

function pickHintTokenIndex(tokenProbabilities) {
  if (!Array.isArray(tokenProbabilities) || tokenProbabilities.length === 0) return -1;

  let bestIndex = -1;
  let bestDistance = Infinity;
  tokenProbabilities.forEach((tokenData, index) => {
    if (!(tokenData.token || '').trim()) return;
    const percentage = sampledPercentage(tokenData);
    if (percentage == null) return;
    const distance = Math.abs(percentage - 55);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  if (bestIndex >= 0) return bestIndex;
  return tokenProbabilities.findIndex((tokenData) => (tokenData.token || '').trim());
}

const getBackgroundColor = (tokenData) => {
  const percentage = sampledPercentage(tokenData);
  if (percentage == null) return 'transparent';
  
  // Define color stops
  const colors = {
    high: { r: 34, g: 197, b: 94 },    // Dark green (#22C55E)
    mid: { r: 234, g: 179, b: 8 },     // Yellow (#EAB308)
    low: { r: 139, g: 0, b: 0 }        // Dark red (#8B0000)
  };
  
  let finalColor;
  if (percentage >= 50) {
    // Blend between high (100%) and mid (50%)
    const ratio = (percentage - 50) / 50; // Will be 0 at 50% and 1 at 100%
    finalColor = {
      r: Math.round(colors.mid.r + (colors.high.r - colors.mid.r) * ratio),
      g: Math.round(colors.mid.g + (colors.high.g - colors.mid.g) * ratio),
      b: Math.round(colors.mid.b + (colors.high.b - colors.mid.b) * ratio)
    };
  } else {
    // Blend between mid (50%) and low (0%)
    const ratio = percentage / 50; // Will be 0 at 0% and 1 at 50%
    finalColor = {
      r: Math.round(colors.low.r + (colors.mid.r - colors.low.r) * ratio),
      g: Math.round(colors.low.g + (colors.mid.g - colors.low.g) * ratio),
      b: Math.round(colors.low.b + (colors.mid.b - colors.low.b) * ratio)
    };
  }
  
  // Calculate opacity based on percentage (0.15 to 0.5)
  const opacity = 0.15 + (percentage / 100) * 0.35;
  
  // Return rgba color
  return `rgba(${finalColor.r}, ${finalColor.g}, ${finalColor.b}, ${opacity})`;
};

export default function Message({ message, onSelect, showHoverHint = false, onHoverUsed, sessionBilled, replayedIn, addedIn, tabsLocked = false, temperature, onTemperatureChange, tokenizer }) {
  const { role, completions, activeIndex = 0, content } = message;
  const [hoveredToken, setHoveredToken] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef(null);
  const hoverGenerationRef = useRef(0);
  const activeTokenElRef = useRef(null);
  const rootRef = useRef(null);
  const completionCount = Array.isArray(completions) ? completions.length : 0;
  const safeIndex = completionCount
    ? Math.min(Math.max(activeIndex, 0), completionCount - 1)
    : 0;

  const userChunks = useMemo(() => {
    if (role !== 'user' || !tokenizer || typeof content !== 'string' || content.length === 0) return null;
    return tokenizeForDisplay(tokenizer, content).chunks;
  }, [role, tokenizer, content]);

  const markHoverUsed = () => {
    if (showHoverHint) onHoverUsed?.();
  };

  const clearHoverTimer = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const invalidateHoverTimer = () => {
    hoverGenerationRef.current += 1;
    clearHoverTimer();
  };

  useEffect(() => () => clearHoverTimer(), []);

  const closeCard = () => {
    invalidateHoverTimer();
    setPinned(false);
    setHoveredToken(null);
  };

  useEffect(() => {
    if (!hoveredToken) return undefined;
    const onDocPointerDown = (event) => {
      const hit = event.target.closest('.token, .token-probabilities-card');
      if (hit && rootRef.current?.contains(hit)) {
        return;
      }
      closeCard();
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [hoveredToken]);

  useEffect(() => {
    if (!hoveredToken) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      closeCard();
      if (activeTokenElRef.current?.isConnected) activeTokenElRef.current.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hoveredToken]);

  const handleTokenMouseEnter = (token, index, event) => {
    if (pinned) return;
    clearHoverTimer();
    markHoverUsed();
    const el = event.currentTarget;
    const generation = hoverGenerationRef.current + 1;
    hoverGenerationRef.current = generation;
    hoverTimeoutRef.current = setTimeout(() => {
      if (generation !== hoverGenerationRef.current) return;
      activeTokenElRef.current = el;
      setHoveredToken({ token, index });
      setMousePosition({ x: event.clientX, y: event.clientY });
    }, 100);
  };

  const handleTokenClick = (token, index, event) => {
    event.preventDefault();
    activeTokenElRef.current = event.currentTarget;
    markHoverUsed();
    invalidateHoverTimer();
    if (pinned && hoveredToken?.index === index) {
      closeCard();
      return;
    }
    const rect = event.currentTarget?.getBoundingClientRect?.();
    const point = Number.isFinite(event.clientX) && event.clientX !== 0
      ? { x: event.clientX, y: event.clientY }
      : { x: rect ? rect.left + rect.width / 2 : 0, y: rect ? rect.bottom : 0 };
    setPinned(true);
    setHoveredToken({ token, index });
    setMousePosition(point);
  };
  
  const handleTokenMouseLeave = () => {
    invalidateHoverTimer();
    if (pinned) return;
    setHoveredToken(null);
  };

  const handleSelect = (index) => {
    if (tabsLocked || index === safeIndex) return;
    invalidateHoverTimer();
    setPinned(false);
    setHoveredToken(null);
    onSelect?.(index);
  };

  const renderContent = () => {
    // Handle non-assistant messages or messages without completions
    if (!completions || role !== 'assistant') {
      if (userChunks) {
        return (
          <div className="message-text">
            {userChunks.map((chunk, index) => (
              <span
                key={index}
                className={`user-token-chunk${index % 2 ? ' is-alt' : ''}${isPartialChunk(chunk) ? ' is-partial' : ''}`}
                aria-hidden={isPartialChunk(chunk) || undefined}
                title={isPartialChunk(chunk) ? 'Part of a character — this token is only a fragment of bytes' : undefined}
              >
                {isPartialChunk(chunk) ? '·' : chunk}
              </span>
            ))}
          </div>
        );
      }
      return <div className="message-text">{content}</div>;
    }

    // Add safety checks for completions array
    if (!Array.isArray(completions) || completions.length === 0) {
      return <div className="message-text">{content || 'No response available'}</div>;
    }

    const activeCompletion = completions[safeIndex];
    
    if (!activeCompletion) {
      return <div className="message-text">{content || 'No response available'}</div>;
    }

    const { text, tokenProbabilities } = activeCompletion;
    
    if (!tokenProbabilities || tokenProbabilities.length === 0) {
      return <div className="message-text">{text || content || 'No response available'}</div>;
    }
    
    const hintIndex = showHoverHint ? pickHintTokenIndex(tokenProbabilities) : -1;

    return (
      <div className="message-text">
        {tokenProbabilities.map((tp, idx) => {
          const backgroundColor = getBackgroundColor(tp);
          return (
            <span
              key={idx}
              className={`token${idx === hintIndex ? ' token-hint' : ''}`}
              style={{ backgroundColor }}
              role="button"
              tabIndex={0}
              aria-expanded={hoveredToken?.index === idx}
              onMouseEnter={(e) => handleTokenMouseEnter(tp.token, idx, e)}
              onClick={(e) => handleTokenClick(tp.token, idx, e)}
              onMouseLeave={handleTokenMouseLeave}
              onKeyDown={(e) => {
                if (e.repeat) return;
                if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
                e.preventDefault();
                handleTokenClick(tp.token, idx, e);
              }}
            >
              {tp.token}
            </span>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className={`message ${role}-message`} ref={rootRef}>
      <div className="message-inner">
        <div className="message-front">
          <div className="message-header">
            {completionCount > 1 && (
              <div className={`completion-tabs-wrap${tabsLocked ? ' is-locked' : ''}`}>
                <div
                  className={`completion-tabs${tabsLocked ? ' is-locked' : ''}`}
                  role="tablist"
                  aria-label={tabsLocked ? 'Locked into the conversation' : 'Alternative responses'}
                  title={tabsLocked ? 'This reply is locked into the conversation' : undefined}
                >
                  {completions.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      role="tab"
                      aria-selected={index === safeIndex}
                      disabled={tabsLocked}
                      className={`completion-tab${index === safeIndex ? ' is-active' : ''}`}
                      title={tabsLocked ? 'This reply is locked into the conversation' : `Show response ${index + 1}`}
                      onClick={() => handleSelect(index)}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
                {tabsLocked && (
                  <span className="completion-lock" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                  </span>
                )}
              </div>
            )}
          </div>
          {renderContent()}
          {(message.timestamp || message.usage) && (
            <div className="message-meta">
              {message.timestamp && (
                <span className="message-timestamp">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              )}
              {message.usage?.prompt_tokens != null && (
                <span
                  className="token-usage"
                  title="in = everything sent this request. replayed = last turn's prompt, sent again. new = last reply + your latest message. out this tab = the reply you are looking at. total out this turn = all samples. conversation total = billed so far."
                >
                  {message.usage.prompt_tokens} in
                  {replayedIn != null
                    ? ` · ${replayedIn} replayed`
                    : ''}
                  {addedIn != null
                    ? ` · ${addedIn} new`
                    : ''}
                  {completions?.[safeIndex]?.tokenProbabilities?.length
                    ? ` · ${completions[safeIndex].tokenProbabilities.length} out this tab`
                    : ''}
                  {message.usage.completion_tokens != null
                    ? ` · ${message.usage.completion_tokens} total out this turn`
                    : ''}
                  {sessionBilled
                    ? ` | ${sessionBilled} conversation total`
                    : ''}
                </span>
              )}
            </div>
          )}
          {showHoverHint && (
            <div className="hover-hint">Tap or hover a highlighted word to see what else the model considered</div>
          )}
        </div>
      </div>
      {hoveredToken && completions && (() => {
        const tokenData = completions[safeIndex]?.tokenProbabilities?.[hoveredToken.index];
        return (
          <TokenProbabilities
            probabilities={tokenData?.top_logprobs || EMPTY_TOP_LOGPROBS}
            position={mousePosition}
            selectedToken={hoveredToken.token}
            selectedLogprob={tokenData?.logprob}
            temperature={temperature}
            onTemperatureChange={onTemperatureChange}
            sampledTemperature={typeof message.sampledTemperature === 'number' ? message.sampledTemperature : null}
            onDismiss={closeCard}
            onMouseEnter={() => clearTimeout(hoverTimeoutRef.current)}
            onMouseLeave={handleTokenMouseLeave}
          />
        );
      })()}
    </div>
  );
} 
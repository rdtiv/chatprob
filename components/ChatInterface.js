import { useState, useRef, useEffect, useCallback, useMemo, useId } from 'react';
import Message from './Message';
import ConversationExplainer from './ConversationExplainer';
import PromptStaircase from './PromptStaircase';
import RequestEcho from './RequestEcho';
import SamplingPanel from './SamplingPanel';
import ForgottenDivider from './ForgottenDivider';
import { SamplingProvider } from './SamplingContext';
import { loadTokenizer } from '../lib/tokenizer';
import { TEMP_DEFAULT, TOP_P_DEFAULT, PENALTY_DEFAULT, BORING_SEED } from '../lib/sampling';
import { pruneForStorage } from '../lib/persistence';
import { buildOutboundMessages, KEEP_ALL, KEEP_TURNS_DEFAULT } from '../lib/contextWindow';

const STARTER_PROMPTS = [
  'The best pizza topping is',
  'Write two different metaphors for rain.',
  'Yes or no: is a hot dog a sandwich?',
];

const FOOL_IT_PROMPTS = [
  'What did the 1994 Geneva Protocol on Digital Privacy establish?',
  'Which U.S. president invented the paperclip?',
  'Why is the Great Wall of China visible from the Moon?',
  "What's the weather in Denver right now?",
];

const MEMORY_PROMPTS = [
  'My name is Ada. Remember it.',
];

const COMPOSER_MAX_HEIGHT = 132; // keep in sync with .message-input max-height in globals.css

const HOVER_HINT_KEY = 'chatprobHoverHintSeen';

const SCROLL_SLOP = 48;

const emptyCompletions = () => [
  { text: '', tokenProbabilities: [] },
  { text: '', tokenProbabilities: [] },
  { text: '', tokenProbabilities: [] },
];

// A tool turn is two requests, but the tool exchange itself is never
// replayed — later turns resend only the model's final text, the same way
// any other assistant turn is echoed back. So "what was replayed" always
// compares FIRST request to FIRST request, turn to turn. `which` picks the
// first or last round of a multi-round turn; an ordinary turn has only one
// round, which serves as both.
const roundPrompt = (item, which) => {
  const rounds = item?.usage?.rounds;
  if (Array.isArray(rounds) && rounds.length > 1) {
    const r = which === 'first' ? rounds[0] : rounds[rounds.length - 1];
    return Number.isFinite(r?.prompt_tokens) ? r.prompt_tokens : null;
  }
  return item?.usage?.prompt_tokens ?? null;
};

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sampling, setSampling] = useState({
    temperature: TEMP_DEFAULT,
    topP: TOP_P_DEFAULT,
    presencePenalty: PENALTY_DEFAULT,
    boring: false,
    restoreTemperature: TEMP_DEFAULT,
    stream: true,
    tools: false,                          // the weather tool is offered only when this is on
    keepTurns: KEEP_ALL,                   // null = replay the whole transcript
    restoreKeepTurns: KEEP_TURNS_DEFAULT,  // remembered slider position while the switch is off
  });
  const [hoverHintVisible, setHoverHintVisible] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [tokenizer, setTokenizer] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelAnchor, setPanelAnchor] = useState({ x: 0, y: 0 });
  const panelId = useId();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inFlightRef = useRef(false);
  const composerRef = useRef(null);
  const tokenizerStartedRef = useRef(false);
  const samplingButtonRef = useRef(null);
  const atBottomRef = useRef(true);
  const nextScrollBehaviorRef = useRef('auto');
  const abortRef = useRef(null);
  const pendingRef = useRef(null);
  const rafRef = useRef(0);
  const unmountedRef = useRef(false);

  const setTemperature = useCallback((t) => setSampling((s) => ({ ...s, temperature: t })), []);
  const samplingValue = useMemo(() => ({ ...sampling, setSampling, setTemperature }), [sampling, setTemperature]);

  // Update page title
  useEffect(() => {
    document.title = 'ChatProb';
  }, []);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Streaming flushes fire many times a second; only autoscroll while the user
  // is already at (or near) the bottom, and only "smooth" right after a send.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom(nextScrollBehaviorRef.current);
    nextScrollBehaviorRef.current = 'auto';
  }, [messages]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_SLOP;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Abort any in-flight stream on unmount so a late chunk never lands on a gone component.
  // The flag must reset in the effect body: StrictMode's dev double-mount runs the cleanup
  // once, and a latch that never clears would silently kill every finalize.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      abortRef.current?.abort();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, []);

  const measureComposer = () => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  };

  useEffect(() => {
    measureComposer();
  }, [currentMessage]);

  const closeSamplingPanel = useCallback(() => {
    setPanelOpen(false);
    samplingButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!panelOpen) return undefined;
    const sync = () => {
      const rect = samplingButtonRef.current?.getBoundingClientRect();
      if (rect) setPanelAnchor({ x: rect.left + rect.width / 2, y: rect.bottom });
    };
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [panelOpen]);

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measureComposer);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem('chatMessages');
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed)) {
          const healed = parsed.map((m) => {
            if (!m?.isStreaming) return m;
            const { isStreaming, ...rest } = m;
            return { ...rest, error: true, aborted: true, usage: null, timing: null };
          });
          setMessages(healed);
        }
      }
      setHoverHintVisible(localStorage.getItem(HOVER_HINT_KEY) !== '1');
    } catch (error) {
      console.error('Could not read saved chat:', error);
    }
    setStorageReady(true);
  }, []);

  const dismissHoverHint = useCallback(() => {
    setHoverHintVisible(false);
    localStorage.setItem(HOVER_HINT_KEY, '1');
  }, []);

  const ensureTokenizer = useCallback(() => {
    if (tokenizerStartedRef.current) return;
    tokenizerStartedRef.current = true;
    loadTokenizer().then((loaded) => {
      if (loaded) setTokenizer(loaded);
      else tokenizerStartedRef.current = false; // allow the next focus/keystroke to retry
    });
  }, []);

  useEffect(() => {
    if (messages.some((m) => m.role === 'user')) ensureTokenizer();
  }, [messages, ensureTokenizer]);

  useEffect(() => {
    if (!storageReady) return;
    if (messages.some((m) => m.isStreaming)) return;
    try {
      localStorage.setItem('chatMessages', JSON.stringify(pruneForStorage(messages)));
    } catch (error) {
      console.error('Could not save chat:', error);
    }
  }, [messages, storageReady]);

  const sendMessage = async (text) => {
    const content = (text ?? currentMessage).trim();
    if (!content || inFlightRef.current) return;

    const snapshot = sampling;
    inFlightRef.current = true;
    const userMessage = { role: 'user', content, timestamp: new Date().toISOString() };
    const conversation = [...messages, userMessage];
    setMessages(conversation);
    atBottomRef.current = true;
    nextScrollBehaviorRef.current = 'smooth';
    setCurrentMessage('');
    setIsLoading(true);

    const startedAt = performance.now();
    const outbound = buildOutboundMessages(conversation, snapshot.keepTurns);
    const requestBody = {
      messages: outbound.messages,
      temperature: snapshot.temperature,
      top_p: snapshot.topP,
      presence_penalty: snapshot.presencePenalty,
      ...(snapshot.boring ? { seed: BORING_SEED } : {}),
      ...(snapshot.tools ? { tools: true } : {}),
    };

    // Tools force the JSON path — the first request ends in a tool call, not
    // in tokens, and the server enforces the same rule.
    if (snapshot.stream && !snapshot.tools) {
      await sendMessageStreaming(requestBody, snapshot, startedAt);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('Response was not ok');
      const data = await response.json();
      const first = data.completions?.[0];
      const totalMs = Math.round(performance.now() - startedAt);

      setMessages(prev => [
        ...prev.map((item) => (
          item.role === 'assistant' && item.echoedMessages
            ? { ...item, echoedMessages: undefined, echoedTools: undefined, echoedToolChoice: undefined }
            : item
        )),
        {
          role: 'assistant',
          content: first?.text || '',
          completions: data.completions,
          activeIndex: 0,
          timestamp: new Date().toISOString(),
          usage: data.usage || null,
          sampling: data.usage?.sampling ?? null,
          sampledTemperature: data.usage?.sampling?.temperature ?? snapshot.temperature,
          echoedMessages: Array.isArray(data.echoedMessages) ? data.echoedMessages : null,
          echoedTools: Array.isArray(data.echoedTools) ? data.echoedTools : null,
          echoedToolChoice: data.echoedToolChoice ?? null,
          toolCall: data.toolCall ?? null,
          toolResult: data.toolResult ?? null,
          toolCalls: data.toolCalls ?? null,
          toolResults: data.toolResults ?? null,
          timing: { ttftMs: totalMs, totalMs, streamed: false },
        },
      ]);
    } catch (error) {
      // Clear-chat aborts an in-flight tools turn; the fetch rejects with
      // AbortError and there is no message to append — the chat was emptied
      // on purpose, so no error bubble and nothing to persist.
      if (error.name === 'AbortError') return;
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, there was an error processing your request.',
        error: true,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      abortRef.current = null;
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const sendMessageStreaming = async (requestBody, snapshot, startedAt) => {
    const provisionalTimestamp = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: '',
        completions: emptyCompletions(),
        activeIndex: 0,
        timestamp: provisionalTimestamp,
        usage: null,
        isStreaming: true,
      },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    let ttftMs = null;
    let metaEchoedMessages = null;
    let metaSampling = null;
    let doneUsage = null;
    let receivedDone = false;
    let streamErrorMessage = null;

    const cancelPendingFrame = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };

    // Applies the pending batch in ONE functional update that rebuilds only the
    // last (streaming) message, so every other message keeps its identity and
    // React.memo skips them — this is what keeps hundreds of deltas cheap.
    const flushDeltas = () => {
      rafRef.current = 0;
      const batch = pendingRef.current;
      pendingRef.current = null;
      if (!batch) return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last?.isStreaming) return prev;
        const completions = last.completions.map((c, i) => {
          const p = batch.byIndex[i];
          if (!p || (!p.text && p.tokens.length === 0)) return c;
          return { text: c.text + p.text, tokenProbabilities: [...c.tokenProbabilities, ...p.tokens] };
        });
        return [...prev.slice(0, -1), { ...last, content: completions[0].text, completions }];
      });
    };

    const queueDelta = (index, text, tokens) => {
      if (!pendingRef.current) pendingRef.current = { byIndex: emptyCompletions().map(() => ({ text: '', tokens: [] })) };
      const slot = pendingRef.current.byIndex[index];
      if (!slot) return;
      slot.text += text;
      if (tokens.length) slot.tokens.push(...tokens);
      if (!rafRef.current) rafRef.current = requestAnimationFrame(flushDeltas);
    };

    const finalizeSuccess = () => {
      if (unmountedRef.current) return;
      cancelPendingFrame();
      flushDeltas();
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last) return prev;
        const completions = (last.completions || []).map((c) => ({ ...c, text: c.text.trim() }));
        const finalMessage = {
          role: 'assistant',
          content: completions[0]?.text ?? '',
          completions,
          activeIndex: 0,
          timestamp: provisionalTimestamp,
          usage: doneUsage,
          sampling: doneUsage?.sampling ?? metaSampling ?? null,
          sampledTemperature: doneUsage?.sampling?.temperature ?? snapshot.temperature,
          echoedMessages: metaEchoedMessages ?? null,
          timing: { ttftMs, totalMs: Math.round(performance.now() - startedAt), streamed: true },
        };
        return [
          ...prev.slice(0, -1).map((item) => (
            item.role === 'assistant' && item.echoedMessages
              ? { ...item, echoedMessages: undefined, echoedTools: undefined, echoedToolChoice: undefined }
              : item
          )),
          finalMessage,
        ];
      });
    };

    const finalizeAborted = () => {
      if (unmountedRef.current) return;
      cancelPendingFrame();
      flushDeltas();
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last) return prev;
        const { isStreaming, ...partialFlushed } = last;
        const completions = (partialFlushed.completions || []).map((c) => ({ ...c, text: c.text.trim() }));
        // Unlike finalizeSuccess, do NOT strip earlier turns' echoedMessages:
        // the aborted turn has no usable disclosure of its own (usage is null),
        // so stripping here would leave no viewable request anywhere.
        return [
          ...prev.slice(0, -1),
          {
            ...partialFlushed,
            completions,
            content: completions[0]?.text ?? '',
            error: true,
            aborted: true,
            usage: null,
            timing: null,
            ...(streamErrorMessage ? { abortReason: streamErrorMessage } : {}),
          },
        ];
      });
    };

    const handleEvent = (event) => {
      if (event.type === 'meta') {
        metaEchoedMessages = Array.isArray(event.echoedMessages) ? event.echoedMessages : null;
        metaSampling = event.sampling ?? null;
      } else if (event.type === 'delta') {
        if (ttftMs == null) ttftMs = Math.round(performance.now() - startedAt);
        queueDelta(event.index, event.text || '', event.tokens || []);
      } else if (event.type === 'done') {
        doneUsage = event.usage ?? null;
        receivedDone = true;
      } else if (event.type === 'error') {
        // receivedDone stays false so the post-loop check finalizes as aborted,
        // but the server's reason must survive — a rate-limited key is not
        // "the connection dropped".
        if (typeof event.message === 'string' && event.message) {
          streamErrorMessage = event.message;
        }
      }
    };

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestBody, stream: true }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error('Response was not ok');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });   // stream:true is MANDATORY (multibyte chars straddle chunks)
        const lines = buffer.split('\n');
        buffer = lines.pop();                                 // keep trailing partial line
        for (const line of lines) {
          if (line.trim()) handleEvent(JSON.parse(line));
        }
      }

      const tail = buffer.trim();
      if (tail) { try { handleEvent(JSON.parse(tail)); } catch { /* incomplete tail — ignored */ } }

      if (receivedDone) finalizeSuccess();
      else finalizeAborted();
    } catch (error) {
      if (error.name !== 'AbortError') console.error('Error:', error);
      finalizeAborted();
    } finally {
      abortRef.current = null;
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await sendMessage(currentMessage);
  };

  const handleComposerKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    sendMessage(currentMessage);
  };

  const selectCompletion = useCallback((messageIndex, completionIndex) => {
    setMessages((prev) => {
      if (prev.slice(messageIndex + 1).some((item) => item.role === 'user')) {
        return prev;
      }
      return prev.map((msg, idx) => {
        if (idx !== messageIndex || !msg.completions?.[completionIndex]) return msg;
        return {
          ...msg,
          activeIndex: completionIndex,
          content: msg.completions[completionIndex]?.text ?? msg.content
        };
      });
    });
  }, []);

  const clearChat = () => {
    // A stream may be in flight — abort it or the emptied chat keeps the
    // typing dots and disabled composer until the full completion is billed.
    abortRef.current?.abort();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    pendingRef.current = null;
    setMessages([]);
    localStorage.removeItem('chatMessages');
  };

  const firstHintableIndex = messages.findIndex((item) => (
    !item.isStreaming &&
    item.role === 'assistant' &&
    item.completions?.some((completion) => completion.tokenProbabilities?.length)
  ));

  const turnBilled = (item) => {
    if (item.role !== 'assistant' || item.usage?.prompt_tokens == null) return 0;
    return (item.usage.prompt_tokens || 0) + (item.usage.completion_tokens || 0);
  };

  // sessionSeries stays one entry per TURN (cost is billed once per turn, no
  // matter how many requests it took). inSeries is one entry per REQUEST: a
  // tool turn's two rounds expand into two entries so "prompt jump" math
  // compares round 1 to round 2 instead of quietly summing them into one
  // inflated, misleading number.
  const sessionSeries = [];
  const inSeries = [];
  let turnCount = 0;
  messages.reduce((running, item) => {
    const next = running + turnBilled(item);
    if (item.role === 'assistant' && item.usage?.prompt_tokens != null) {
      sessionSeries.push(next);
      turnCount += 1;
      const rounds = Array.isArray(item.usage.rounds) && item.usage.rounds.length > 1 ? item.usage.rounds : null;
      if (rounds) {
        rounds.forEach((round) => inSeries.push(Number.isFinite(round?.prompt_tokens) ? round.prompt_tokens : null));
      } else {
        inSeries.push(Number.isFinite(item.usage.prompt_tokens) ? item.usage.prompt_tokens : null);
      }
    }
    return next;
  }, 0);
  const sessionBilled = sessionSeries[sessionSeries.length - 1] || 0;
  const assistantTurnsWithUsage = messages.filter((item) => item.role === 'assistant' && item.usage);
  const lastAssistant = assistantTurnsWithUsage[assistantTurnsWithUsage.length - 1] || null;
  const prevAssistant = assistantTurnsWithUsage.length > 1
    ? assistantTurnsWithUsage[assistantTurnsWithUsage.length - 2]
    : null;
  const lastIn = roundPrompt(lastAssistant, 'first');
  const prevIn = roundPrompt(prevAssistant, 'first');
  const toolRoundIn = lastAssistant?.usage?.rounds?.length > 1 ? roundPrompt(lastAssistant, 'last') : null;

  const forgetting = useMemo(
    () => buildOutboundMessages(messages, sampling.keepTurns),
    [messages, sampling.keepTurns]
  );

  // The last message with role 'assistant', regardless of usage — streaming
  // and error states are handled by Message.js itself (it hides the note
  // while streaming or when the newest turn errored), not by filtering the
  // index here. This differs from lastAssistant (which requires a usage
  // object to drive the cost/staircase math) because the note belongs to the
  // newest reply even before usage has landed.
  const latestAssistantIndex = messages.reduce(
    (found, item, index) => (item.role === 'assistant' ? index : found),
    -1
  );

  return (
    <SamplingProvider value={samplingValue}>
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
            <button
              ref={samplingButtonRef}
              type="button"
              className="sampling-button"
              aria-expanded={panelOpen}
              aria-controls={panelOpen ? panelId : undefined}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setPanelAnchor({ x: rect.left + rect.width / 2, y: rect.bottom });
                setPanelOpen((open) => !open);
              }}
            >
              Sampling · {sampling.temperature.toFixed(1)}
            </button>
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
          <span className="legend-item is-unsure">
            <span className="legend-swatch legend-swatch-mid" />
            mixed
          </span>
          <span className="legend-item is-very-unsure">
            <span className="legend-swatch legend-swatch-low" />
            less sure
          </span>
          <span className="legend-hover">Tap or hover a word for the other choices</span>
          <span className="legend-honesty">Green means expected, not true.</span>
        </div>
        {sessionBilled > 0 && (
          <div className={`conversation-lesson${lessonOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="conversation-lesson-summary"
              aria-expanded={lessonOpen}
              aria-controls="conversation-lesson-body"
              onClick={() => setLessonOpen((open) => !open)}
            >
              <div className="conversation-lesson-metrics">
                <div className="conversation-lesson-row">
                  <span className="conversation-lesson-label">Prompt this turn</span>
                  <span className="conversation-lesson-values">{inSeries.join(' → ')} in</span>
                </div>
                <div className="conversation-lesson-row">
                  <span className="conversation-lesson-label">Paid so far</span>
                  <span className="conversation-lesson-values">{sessionSeries.join(' → ')} billed</span>
                </div>
              </div>
              <span className="conversation-lesson-toggle">
                {lessonOpen ? 'Hide' : 'Details'}
                <span className="conversation-lesson-chevron" aria-hidden="true" />
              </span>
            </button>
            <div id="conversation-lesson-body" className="conversation-lesson-body">
              <PromptStaircase messages={messages} />
              <ConversationExplainer
                inSeries={inSeries}
                sessionSeries={sessionSeries}
                lastAssistant={lastAssistant}
                messages={messages}
                droppedMessages={forgetting.cutoffIndex}
                keepTurns={sampling.keepTurns}
                turns={turnCount}
                lastIn={lastIn}
                prevIn={prevIn}
                toolRoundIn={toolRoundIn}
              />
              <RequestEcho
                echoedMessages={lastAssistant?.echoedMessages}
                echoedTools={lastAssistant?.echoedTools}
                echoedToolChoice={lastAssistant?.echoedToolChoice}
              />
            </div>
          </div>
        )}
        <div className="messages-container" ref={messagesContainerRef}>
          {messages.length === 0 && !isLoading && (
            <div className="empty-start">
              <ConversationExplainer inSeries={[]} sessionSeries={[]} lastAssistant={null} />
              {[
                { ariaLabel: 'Starter prompts', label: null, prompts: STARTER_PROMPTS },
                { ariaLabel: 'Prompts that invite confident mistakes', label: 'Try to fool it:', prompts: FOOL_IT_PROMPTS },
                { ariaLabel: 'Prompts that seed a fact to forget', label: 'Give it a fact to remember:', prompts: MEMORY_PROMPTS },
              ].map(({ ariaLabel, label, prompts }) => (
                <div key={ariaLabel} className="prompt-chips" aria-label={ariaLabel}>
                  {label && <span className="prompt-chips-label">{label}</span>}
                  {prompts.map((prompt) => (
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
              ))}
            </div>
          )}
          {messages.flatMap((message, index) => {
            const billedThrough = messages
              .slice(0, index + 1)
              .reduce((sum, item) => sum + turnBilled(item), 0);
            const previousMessage = [...messages.slice(0, index)]
              .reverse()
              .find((item) => item.role === 'assistant' && item.usage?.prompt_tokens != null);
            const previousIn = roundPrompt(previousMessage, 'first');
            const thisIn = roundPrompt(message, 'first');
            const replayedIn = Number.isFinite(previousIn) ? previousIn : null;
            const addedIn = Number.isFinite(thisIn) && Number.isFinite(previousIn)
              ? Math.max(0, thisIn - previousIn)
              : null;
            const node = (
            <Message
              key={index}
              message={message}
              onSelect={selectCompletion}
              messageIndex={index}
              showHoverHint={hoverHintVisible && index === firstHintableIndex}
              onHoverUsed={dismissHoverHint}
              sessionBilled={message.role === 'assistant' ? billedThrough : null}
              replayedIn={message.role === 'assistant' ? replayedIn : null}
              addedIn={message.role === 'assistant' ? addedIn : null}
              tabsLocked={messages.slice(index + 1).some((item) => item.role === 'user')}
              tokenizer={tokenizer}
              forgotten={forgetting.truncated && index < forgetting.cutoffIndex}
              isLatestAssistant={index === latestAssistantIndex}
            />
            );
            if (!forgetting.truncated || index !== forgetting.cutoffIndex) return [node];
            return [
              <ForgottenDivider key="forgotten-divider" messageCount={forgetting.cutoffIndex} />,
              node,
            ];
          })}
          {isLoading && !messages.some((m) => m.isStreaming && m.completions?.[0]?.tokenProbabilities?.length) && (
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
          <div className="composer-row">
            <textarea
              ref={composerRef}
              rows={1}
              value={currentMessage}
              onChange={(e) => {
                ensureTokenizer();
                setCurrentMessage(e.target.value);
              }}
              onFocus={ensureTokenizer}
              onKeyDown={handleComposerKeyDown}
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
        {panelOpen && (
          <SamplingPanel id={panelId} anchor={panelAnchor} onClose={closeSamplingPanel} />
        )}
      </div>
    </div>
    </SamplingProvider>
  );
}
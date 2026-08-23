import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, useId } from 'react';

// useLayoutEffect warns during SSR on React 18; the pages router renders this
// component on the server, so fall back to useEffect there (it never runs anyway).
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
import Message from './Message';
import CoachMark from './CoachMark';
import ConversationExplainer, { CostFooter } from './ConversationExplainer';
import PromptStaircase from './PromptStaircase';
import RequestEcho from './RequestEcho';
import SamplingPanel from './SamplingPanel';
import ForgottenDivider from './ForgottenDivider';
import { SamplingProvider } from './SamplingContext';
import { loadTokenizer } from '../lib/tokenizer';
import { TEMP_DEFAULT, TOP_P_DEFAULT, PENALTY_DEFAULT, BORING_SEED } from '../lib/sampling';
import { pruneForStorage } from '../lib/persistence';
import { abortedFields, abortedTurn } from '../lib/abortedTurn';
import { buildOutboundMessages, KEEP_ALL, KEEP_TURNS_DEFAULT } from '../lib/contextWindow';
import { knowledgeCutoff } from '../lib/modelFacts';
import { formatTokenSummary } from '../lib/usage';
import { needsCutoffNote, mentionsWeather } from '../lib/cutoffRelevance';
import { COACH_TEXT_COLOR, COACH_TEXT_TABS, COACH_TEXT_COST } from '../lib/coachCopy';

// There is deliberately no "watch it be confidently wrong" chip. Every version
// of that demo depends on the model being bad at something, and gpt-4o-mini is
// well calibrated on exactly the questions that used to work: it corrects the
// famous myths, solves the classic riddles at 95-100% confidence, and hedges
// ("this can vary by context") on judgment calls in 18 of 21 replies. What does
// not depend on model quality is already here — three sample tabs disagreeing
// on one prompt, the temperature control, forgetting, and the tool round trip.
const STARTER_PROMPTS = [
  'The best pizza topping is',
  'Write two different metaphors for rain.',
  // The weather prompt is the doorway to tool calling: cold, with tools off,
  // the model has to admit it cannot know. Controls -> "Let it call a weather
  // tool" is what turns that into a tool round trip.
  "What's the weather in Denver right now?",
];

const MEMORY_PROMPTS = [
  'My name is Ada. Remember it.',
];

const COMPOSER_MAX_HEIGHT = 132; // keep in sync with .message-input max-height in globals.css

// coachStep: 0 = show the color coach mark, 1 = show the tabs coach mark,
// 2 = show the cost coach mark, 3 = done. Persisted so a returning visitor
// does not see marks they already dismissed.
const COACH_KEY = 'chatprobCoach';
const COACH_TOTAL = 3;

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
  const [coachStep, setCoachStep] = useState(0);
  const [legendWhyOpen, setLegendWhyOpen] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  // Keyed by follow-up kind ('memory', 'tools'): each one is offered once.
  const [followupsUsed, setFollowupsUsed] = useState({});
  const [storageReady, setStorageReady] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [tokenizer, setTokenizer] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelAnchor, setPanelAnchor] = useState({ x: 0, y: 0 });
  const panelId = useId();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const chatContainerRef = useRef(null);
  const inFlightRef = useRef(false);
  const composerRef = useRef(null);
  const tokenizerStartedRef = useRef(false);
  const samplingButtonRef = useRef(null);
  const atBottomRef = useRef(true);
  const nextScrollBehaviorRef = useRef('auto');
  const abortRef = useRef(null);
  // Set true by the Stop button just before it aborts, so the catch blocks
  // can tell a user-initiated stop (append an aborted-turn message) apart
  // from clearChat's abort (transcript already emptied, stay silent).
  const stopRequestedRef = useRef(false);
  // Copy for the aborted-turn note when the user pressed Stop, as opposed to a
  // dropped connection (the note's default).
  const STOP_REASON = 'You stopped this reply';
  const pendingRef = useRef(null);
  const rafRef = useRef(0);
  const unmountedRef = useRef(false);
  const clearArmedTimeoutRef = useRef(null);
  const step3OpenedRef = useRef(false);

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

  // The cost card lives inside the scrolling transcript, so opening or
  // closing it changes the scroll height; keep the view pinned to the bottom
  // if that is where the user was.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom('auto');
  }, [lessonOpen]);

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
      const rawCoach = Number(localStorage.getItem(COACH_KEY)) || 0;
      setCoachStep(Math.min(Math.max(rawCoach, 0), 3));
    } catch (error) {
      console.error('Could not read saved chat:', error);
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(COACH_KEY, String(coachStep));
    } catch (error) {
      console.error('Could not save coach progress:', error);
    }
  }, [coachStep, storageReady]);

  useEffect(() => () => {
    if (clearArmedTimeoutRef.current) clearTimeout(clearArmedTimeoutRef.current);
  }, []);

  // Advance FROM a given step only: a hover and a click can both fire from the
  // same render with the same coach closure, and must not skip a step together.
  const advanceCoach = useCallback((from) => {
    setCoachStep((s) => (s === from ? Math.min(s + 1, 3) : s));
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

  // `override` lets a caller change a sampling value for THIS send in the same
  // handler that schedules the state update — React state is async, so reading
  // `sampling` here would still see the old value.
  const sendMessage = async (text, source = 'typed', override = null) => {
    const content = (text ?? currentMessage).trim();
    if (!content || inFlightRef.current) return;

    const snapshot = override ? { ...sampling, ...override } : sampling;
    inFlightRef.current = true;
    const userMessage = { role: 'user', content, timestamp: new Date().toISOString(), source };
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
      if (error.name === 'AbortError') {
        // Clear-chat also aborts an in-flight tools turn; the fetch rejects
        // with AbortError and there is no message to append — the chat was
        // emptied on purpose, so no error bubble and nothing to persist.
        // A Stop click is different: the user message is still on screen and
        // needs a reply, so append the same aborted-turn shape the streaming
        // path uses (minus any partial text — the JSON path never has any).
        if (stopRequestedRef.current && !unmountedRef.current) {
          setMessages((prev) => [...prev, abortedTurn({ reason: STOP_REASON })]);
        }
        return;
      }
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, there was an error processing your request.',
        error: true,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      abortRef.current = null;
      stopRequestedRef.current = false;
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
            ...abortedFields(streamErrorMessage ?? (stopRequestedRef.current ? STOP_REASON : null)),
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
      stopRequestedRef.current = false;
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
    // This is not a user Stop, so make sure the JSON-path catch stays silent.
    stopRequestedRef.current = false;
    abortRef.current?.abort();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    pendingRef.current = null;
    setMessages([]);
    localStorage.removeItem('chatMessages');
  };

  const handleClearClick = () => {
    if (clearArmed) {
      if (clearArmedTimeoutRef.current) {
        clearTimeout(clearArmedTimeoutRef.current);
        clearArmedTimeoutRef.current = null;
      }
      setClearArmed(false);
      clearChat();
      return;
    }
    setClearArmed(true);
    clearArmedTimeoutRef.current = setTimeout(() => setClearArmed(false), 3000);
  };

  // A settled reply is one that finished (no longer streaming), did not
  // error, and actually has token probabilities to look at — the surface
  // the coach marks and the "?" affordances are all built around.
  const settledReplies = [];
  messages.forEach((item, index) => {
    if (
      item.role === 'assistant' &&
      !item.isStreaming &&
      !item.error &&
      item.completions?.some((completion) => completion.tokenProbabilities?.length)
    ) {
      settledReplies.push(index);
    }
  });
  const isTabsLocked = (index) => messages.slice(index + 1).some((item) => item.role === 'user');
  const step1TargetIndex = settledReplies.length ? settledReplies[0] : -1;
  const step2TargetIndex = [...settledReplies].reverse().find((index) => !isTabsLocked(index)) ?? -1;

  useEffect(() => {
    if (coachStep === 1 && step2TargetIndex < 0) advanceCoach(1);
  }, [coachStep, step2TargetIndex, advanceCoach]);

  const step3Eligible = settledReplies.length >= 2;
  useEffect(() => {
    if (coachStep === 2 && step3Eligible && !step3OpenedRef.current) {
      step3OpenedRef.current = true;
      setLessonOpen(true);
    }
  }, [coachStep, step3Eligible]);

  let lastUserIndex = -1;
  messages.forEach((item, index) => {
    if (item.role === 'user') lastUserIndex = index;
  });
  const lastUser = lastUserIndex >= 0 ? messages[lastUserIndex] : null;
  const replyAfterLastUser = lastUserIndex >= 0 ? messages[lastUserIndex + 1] : null;
  const replyLanded = replyAfterLastUser?.role === 'assistant' &&
    !replyAfterLastUser.isStreaming &&
    !replyAfterLastUser.error &&
    replyAfterLastUser.completions?.some((completion) => completion.tokenProbabilities?.length);
  const replyUsedTool = !!replyAfterLastUser?.toolCall ||
    (Array.isArray(replyAfterLastUser?.toolCalls) && replyAfterLastUser.toolCalls.length > 0);

  // Both follow-ups turn a Control the visitor has not found yet into one tap,
  // offered at the only moment its lesson is legible: straight after a reply
  // that the Control would have changed. The tool one is offered for any
  // weather question, chipped or typed — with tools off the model can only
  // decline, and that decline is the setup for the tool round trip.
  let followup = null;
  if (replyLanded && !followupsUsed.memory && lastUser?.source === 'chip-memory') {
    followup = { kind: 'memory', label: 'Now make it forget' };
  } else if (replyLanded && !followupsUsed.tools && !sampling.tools && !replyUsedTool &&
             mentionsWeather(lastUser?.content)) {
    followup = { kind: 'tools', label: 'Now give it the tool' };
  }

  const followupKind = followup?.kind ?? null;

  // The glass header and composer float over the transcript, so the scroller has
  // to reserve their heights as padding. Measured, never hard-coded: the header
  // wraps on narrow screens, the composer grows with the textarea up to
  // COMPOSER_MAX_HEIGHT, and the two conditional strips (the legend's why-note,
  // the follow-up chip row) come and go. Same ResizeObserver pattern as
  // useAnchoredSurface, writing onto .chat-container. A layout effect, not a
  // passive one: the measured values must land before the first paint, or the
  // transcript is drawn once with the shell.css fallbacks and then jumps.
  useIsomorphicLayoutEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return undefined;
    const targets = [
      ['--header-h', document.querySelector('.chat-header')],
      ['--why-h', document.querySelector('.chat-container > .why-note')],
      ['--composer-h', document.querySelector('.message-form')],
      ['--followup-h', document.querySelector('.chat-container > .prompt-chips')],
    ];
    const apply = () => {
      targets.forEach(([name, el]) => {
        if (el) container.style.setProperty(name, `${Math.ceil(el.getBoundingClientRect().height)}px`);
        else container.style.removeProperty(name);
      });
    };
    apply();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    targets.forEach(([, el]) => { if (el) observer?.observe(el); });
    window.addEventListener('resize', apply);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [legendWhyOpen, followupKind]);

  let coachTargetIndex = -1;
  let coach = null;
  if (coachStep === 0 && step1TargetIndex >= 0) {
    coachTargetIndex = step1TargetIndex;
    coach = { step: 1, total: COACH_TOTAL, text: COACH_TEXT_COLOR, onDone: () => advanceCoach(0) };
  } else if (coachStep === 1 && step2TargetIndex >= 0) {
    coachTargetIndex = step2TargetIndex;
    coach = { step: 2, total: COACH_TOTAL, text: COACH_TEXT_TABS, onDone: () => advanceCoach(1) };
  }

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
  const sentThisTurn = formatTokenSummary(lastAssistant?.usage) ?? '—';

  const forgetting = useMemo(
    () => buildOutboundMessages(messages, sampling.keepTurns),
    [messages, sampling.keepTurns]
  );

  // The long cutoff note opens by itself once per conversation, on the first
  // reply where it is relevant: a plain text reply (no tool call, no error)
  // from a model with a known cutoff, whose prompt asked for something recent
  // or came from a "Try to fool it" chip (needsCutoffNote). Every other
  // qualifying reply carries only the pill, and the pill's "?" can open the
  // same note on any of them. This index never moves once found.
  const firstCutoffIndex = messages.findIndex((item, index, arr) => {
    if (item.role !== 'assistant') return false;
    if (item.error) return false;
    if (item.toolCall) return false;
    if (Array.isArray(item.toolCalls) && item.toolCalls.length) return false;
    if (!knowledgeCutoff(item.usage?.model)) return false;
    const precedingUser = [...arr.slice(0, index)].reverse().find((m) => m.role === 'user');
    return needsCutoffNote(precedingUser);
  });

  const costPanel = sessionBilled > 0 && (
    <div className={`conversation-lesson${lessonOpen ? ' is-open' : ''}`} data-lesson="cost">
      <button
        type="button"
        className="conversation-lesson-summary"
        aria-expanded={lessonOpen}
        aria-controls="conversation-lesson-body"
        onClick={() => setLessonOpen((open) => !open)}
      >
        <div className="conversation-lesson-metrics">
          <p className="conversation-lesson-title">What each request carried</p>
          <div className="conversation-lesson-row">
            <span className="conversation-lesson-label">Sent this turn</span>
            <span className="conversation-lesson-values">{sentThisTurn}</span>
          </div>
          <div className="conversation-lesson-row">
            <span className="conversation-lesson-label">Conversation so far</span>
            <span className="conversation-lesson-values">{sessionBilled.toLocaleString()} tokens</span>
          </div>
        </div>
        <span className="conversation-lesson-toggle">
          {lessonOpen ? 'Hide' : 'Details'}
          <span className="conversation-lesson-chevron" aria-hidden="true" />
        </span>
      </button>
      {coachStep === 2 && step3Eligible && (
        <CoachMark step={3} total={COACH_TOTAL} text={COACH_TEXT_COST} onDone={() => advanceCoach(2)} />
      )}
      <div id="conversation-lesson-body" className="conversation-lesson-body">
        <PromptStaircase messages={messages} />
        <CostFooter
          messages={messages}
          lastAssistant={lastAssistant}
          sessionBilled={sessionBilled}
          whyText={COACH_TEXT_COST}
        />
        <ConversationExplainer
          inSeries={inSeries}
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
  );

  return (
    <SamplingProvider value={samplingValue}>
    <div className="app-shell">
      <div className="chat-container" ref={chatContainerRef}>
        <div className="chat-header glass">
          <div className="header-actions">
            <div className="legend-inline">
              <span className="legend-item">
                <span className="legend-swatch legend-swatch-high" />
                likely
              </span>
              <span className="legend-item is-unsure">
                <span className="legend-swatch legend-swatch-mid" />
                toss-up
              </span>
              <span className="legend-item is-very-unsure">
                <span className="legend-swatch legend-swatch-low" />
                long shot
              </span>
              <span className="legend-honesty">Likely ≠ true.</span>
              <button
                type="button"
                className="why-button"
                aria-label="What does this mean?"
                aria-expanded={legendWhyOpen}
                onClick={() => setLegendWhyOpen((open) => !open)}
              >
                ?
              </button>
            </div>
            <button
              ref={samplingButtonRef}
              type="button"
              className="sampling-button glass-chip"
              aria-expanded={panelOpen}
              aria-controls={panelOpen ? panelId : undefined}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setPanelAnchor({ x: rect.left + rect.width / 2, y: rect.bottom });
                setPanelOpen((open) => !open);
              }}
            >
              Controls
              <span className="control-chip">temp {sampling.temperature.toFixed(1)}</span>
              {sampling.stream === false && <span className="control-chip">streaming off</span>}
              {sampling.keepTurns != null && (
                <span className="control-chip">
                  {sampling.keepTurns === 0 ? 'memory none' : `memory last ${sampling.keepTurns}`}
                </span>
              )}
              {sampling.tools && <span className="control-chip">tool on</span>}
              {sampling.boring && <span className="control-chip">repeatable</span>}
            </button>
          <button
            onClick={handleClearClick}
            className="refresh-button is-text glass-chip"
            aria-label={clearArmed ? 'Confirm clear chat history' : 'Clear chat history'}
          >
            {clearArmed ? 'Clear?' : 'Clear'}
          </button>
          </div>
        </div>
        {legendWhyOpen && <p className="why-note glass">{COACH_TEXT_COLOR}</p>}
        <div className="messages-container" ref={messagesContainerRef}>
          {messages.length === 0 && !isLoading && (
            <div className="empty-start">
              <ConversationExplainer inSeries={[]} lastAssistant={null} />
              {[
                { ariaLabel: 'Starter prompts', label: null, prompts: STARTER_PROMPTS, source: 'chip-starter', hint: null },
                { ariaLabel: 'Prompts that seed a fact to forget', label: 'Give it a fact to remember:', prompts: MEMORY_PROMPTS, source: 'chip-memory', hint: 'then open Controls → Forget older turns, and ask "What is my name?"' },
              ].map(({ ariaLabel, label, prompts, source, hint }) => (
                <div key={ariaLabel} className="prompt-chips" aria-label={ariaLabel}>
                  {label && <span className="prompt-chips-label">{label}</span>}
                  {prompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="prompt-chip glass-chip"
                      disabled={isLoading}
                      onClick={() => sendMessage(prompt, source)}
                    >
                      {prompt}
                    </button>
                  ))}
                  {hint && <span className="prompt-chips-hint">{hint}</span>}
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
            const cutoffPrompt = [...messages.slice(0, index)]
              .reverse()
              .find((item) => item.role === 'user') ?? null;
            const node = (
            <Message
              key={index}
              message={message}
              onSelect={selectCompletion}
              messageIndex={index}
              coach={index === coachTargetIndex ? coach : null}
              onCoachAdvance={index === coachTargetIndex ? () => advanceCoach(coachStep) : undefined}
              sessionBilled={message.role === 'assistant' ? billedThrough : null}
              replayedIn={message.role === 'assistant' ? replayedIn : null}
              addedIn={message.role === 'assistant' ? addedIn : null}
              tabsLocked={messages.slice(index + 1).some((item) => item.role === 'user')}
              tokenizer={tokenizer}
              forgotten={forgetting.truncated && index < forgetting.cutoffIndex}
              showCutoffDetail={index === firstCutoffIndex}
              cutoffPrompt={cutoffPrompt}
            />
            );
            if (!forgetting.truncated || index !== forgetting.cutoffIndex) return [node];
            return [
              <ForgottenDivider key="forgotten-divider" messageCount={forgetting.cutoffIndex} />,
              node,
            ];
          })}
          {costPanel}
          {isLoading && !messages.some((m) => m.isStreaming && m.completions?.[0]?.tokenProbabilities?.length) && (
            <div className="typing-dots">
              <span />
              <span />
              <span />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        {followup && (
          <div className="prompt-chips glass" aria-label="Follow-up prompt">
            <button
              type="button"
              className="prompt-chip glass-chip"
              disabled={isLoading}
              onClick={() => {
                setFollowupsUsed((used) => ({ ...used, [followup.kind]: true }));
                if (followup.kind === 'memory') {
                  setSampling((s) => ({ ...s, keepTurns: 0 }));
                  sendMessage('What is my name?', 'chip-memory', { keepTurns: 0 });
                } else {
                  // Same question, tool in hand: the two replies sit next to
                  // each other in the transcript, which is the whole lesson.
                  setSampling((s) => ({ ...s, tools: true }));
                  sendMessage(lastUser.content, 'chip-tool', { tools: true });
                }
              }}
            >
              {followup.label}
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="message-form">
          <div className="composer-row glass">
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
              placeholder="Your words become tokens"
              disabled={isLoading}
              className="message-input"
            />
            {isLoading ? (
              <button
                type="button"
                className="send-button is-stop"
                aria-label="Stop reply"
                title="Stop"
                onClick={() => {
                  stopRequestedRef.current = true;
                  abortRef.current?.abort();
                }}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <rect x="5.5" y="5.5" width="9" height="9" rx="2" fill="currentColor" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!currentMessage.trim()}
                className={`send-button${currentMessage.trim() ? ' is-ready' : ''}`}
                aria-label="Send message"
                title="Send"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M10 16V4.5M10 4.5 4.75 9.75M10 4.5l5.25 5.25" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
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
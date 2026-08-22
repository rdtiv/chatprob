// Mission 9 gate spike: tools + n:3 + logprobs, logprobs-over-tool-calls, and
// usage accounting across a two-round tool-call/tool-result exchange.
// Live API calls — run manually only, never in CI.
import { readFileSync, writeFileSync } from 'node:fs';
import { OpenAI } from 'openai';
import { WEATHER_TOOLS } from '../lib/weatherTool.js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL || undefined });
const model = env.OPENAI_MODEL || 'gpt-4o-mini';

const VARIETY_SYSTEM_PROMPT =
  'You help people see that language models sample from a next-token distribution. Vary your wording and sentence openings. Keep answers concise (one or two sentences unless asked otherwise).';

const TOOLS = WEATHER_TOOLS;

const USER_PROMPT = "What's the weather in Denver right now?";

function baseMessages() {
  return [
    { role: 'system', content: VARIETY_SYSTEM_PROMPT },
    { role: 'user', content: USER_PROMPT },
  ];
}

function summarizeChoice(choice) {
  const msg = choice.message || {};
  const toolCalls = (msg.tool_calls || []).map((tc) => ({
    name: tc.function?.name,
    arguments: tc.function?.arguments,
  }));
  return {
    index: choice.index,
    finish_reason: choice.finish_reason,
    has_tool_calls: toolCalls.length > 0,
    tool_calls: toolCalls,
    content: msg.content ?? null,
  };
}

function describeLogprobs(choice) {
  const lp = choice.logprobs;
  if (!lp) return { present: false };
  const content = lp.content;
  const hasRefusalKey = Object.prototype.hasOwnProperty.call(lp, 'refusal');
  return {
    present: true,
    keys: Object.keys(lp),
    content_is_null_or_empty: content == null || (Array.isArray(content) && content.length === 0),
    content_length: Array.isArray(content) ? content.length : null,
    first_5_tokens: Array.isArray(content) ? content.slice(0, 5).map((t) => t.token) : null,
    has_refusal_key: hasRefusalKey,
    refusal_value: hasRefusalKey ? lp.refusal : undefined,
  };
}

async function main() {
  console.log('model requested:', model);
  console.log('='.repeat(80));

  // ---------------- GATE 1 ----------------
  console.log('\n--- GATE 1: tools + n:3 + logprobs in one request (3 runs @ temp 1.0) ---');
  let firstGoodResponse = null;
  for (let run = 1; run <= 3; run++) {
    console.log(`\nRun ${run} (temperature 1.0):`);
    try {
      const resp = await openai.chat.completions.create({
        model,
        messages: baseMessages(),
        tools: TOOLS,
        n: 3,
        logprobs: true,
        top_logprobs: 5,
        temperature: 1.0,
      });
      console.log('  accepted. response.model =', resp.model);
      for (const choice of resp.choices) {
        console.log('  ', JSON.stringify(summarizeChoice(choice)));
      }
      if (!firstGoodResponse) firstGoodResponse = resp;
    } catch (err) {
      console.log('  REJECTED. error:', err?.status, err?.message || err);
    }
  }

  console.log('\nRun with temperature 1.5:');
  try {
    const resp15 = await openai.chat.completions.create({
      model,
      messages: baseMessages(),
      tools: TOOLS,
      n: 3,
      logprobs: true,
      top_logprobs: 5,
      temperature: 1.5,
    });
    console.log('  accepted. response.model =', resp15.model);
    for (const choice of resp15.choices) {
      console.log('  ', JSON.stringify(summarizeChoice(choice)));
    }
  } catch (err) {
    console.log('  REJECTED. error:', err?.status, err?.message || err);
  }

  // ---------------- GATE 2 ----------------
  console.log('\n' + '='.repeat(80));
  console.log('\n--- GATE 2: logprobs over tool-call tokens ---');
  let toolCallChoice = null;
  let round1Response = firstGoodResponse;
  if (round1Response) {
    toolCallChoice = round1Response.choices.find((c) => c.message?.tool_calls?.length);
  }
  if (!toolCallChoice) {
    console.log('No tool_calls choice found in Gate 1 runs; making a dedicated n:1 call for Gate 2.');
    const resp = await openai.chat.completions.create({
      model,
      messages: baseMessages(),
      tools: TOOLS,
      n: 1,
      logprobs: true,
      top_logprobs: 5,
      temperature: 1.0,
    });
    round1Response = resp;
    toolCallChoice = resp.choices.find((c) => c.message?.tool_calls?.length) || resp.choices[0];
  }
  console.log('Chosen choice summary:', JSON.stringify(summarizeChoice(toolCallChoice)));
  console.log('choice.logprobs structure:', JSON.stringify(describeLogprobs(toolCallChoice), null, 2));

  // ---------------- GATE 3 ----------------
  console.log('\n' + '='.repeat(80));
  console.log('\n--- GATE 3: usage accounting across two rounds ---');

  // Ensure we have a round-1 response with n:1 (or use choice 0 of an n:3 response) that has tool_calls.
  let r1 = round1Response;
  let r1ToolChoice = r1.choices.find((c) => c.message?.tool_calls?.length);
  if (!r1ToolChoice) {
    console.log('Round-1 response has no tool_calls choice at all; making a fresh n:1 call for Gate 3.');
    r1 = await openai.chat.completions.create({
      model,
      messages: baseMessages(),
      tools: TOOLS,
      n: 1,
      logprobs: true,
      top_logprobs: 5,
      temperature: 1.0,
    });
    r1ToolChoice = r1.choices.find((c) => c.message?.tool_calls?.length) || r1.choices[0];
  }

  console.log('\nRound 1 usage:', JSON.stringify(r1.usage, null, 2));
  console.log('Round 1 chosen message:', JSON.stringify(r1ToolChoice.message, null, 2));

  writeFileSync('/Users/dant/.claude/jobs/87c0abf6/tmp/spike-round1.json', JSON.stringify(r1, null, 2));

  const toolCall = r1ToolChoice.message.tool_calls?.[0];
  let r2 = null;
  if (!toolCall) {
    console.log('\nRound 1 did not produce a tool call — cannot build round 2. Skipping round 2.');
  } else {
    const fakeToolResult = {
      location: 'Denver',
      temperature_f: 71,
      temperature_c: 21.7,
      condition: 'Partly cloudy',
      wind_mph: 8,
      humidity: 35,
      feels_like_f: 70,
    };

    const round2Messages = [
      { role: 'system', content: VARIETY_SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: toolCall.id,
            type: 'function',
            function: { name: toolCall.function.name, arguments: toolCall.function.arguments },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(fakeToolResult),
      },
    ];

    r2 = await openai.chat.completions.create({
      model,
      messages: round2Messages,
      tools: TOOLS,
      n: 3,
      logprobs: true,
      top_logprobs: 5,
    });

    console.log('\nRound 2 usage:', JSON.stringify(r2.usage, null, 2));
    const r1Total = (r1.usage?.prompt_tokens || 0) + (r1.usage?.completion_tokens || 0);
    console.log('Round 1 prompt+completion tokens:', r1Total);
    console.log('Round 2 prompt_tokens:', r2.usage?.prompt_tokens, '(expected roughly >=', r1Total, '+ tool-result tokens)');

    for (const choice of r2.choices) {
      console.log(`\nRound 2 choice ${choice.index}:`);
      console.log('  finish_reason:', choice.finish_reason);
      console.log('  has_tool_calls (tries to call tool again?):', !!choice.message?.tool_calls?.length);
      if (choice.message?.tool_calls?.length) {
        console.log('  tool_calls:', JSON.stringify(choice.message.tool_calls));
      }
      console.log('  content:', JSON.stringify(choice.message?.content));
      const lp = describeLogprobs(choice);
      console.log('  logprobs for final text present:', lp.present && !lp.content_is_null_or_empty, JSON.stringify(lp));
    }

    writeFileSync('/Users/dant/.claude/jobs/87c0abf6/tmp/spike-round2.json', JSON.stringify(r2, null, 2));
  }

  // ---------------- EXTRA PROBE: no tools, n:3, logprobs ----------------
  console.log('\n' + '='.repeat(80));
  console.log('\n--- EXTRA PROBE: same prompt, NO tools, n:3, logprobs ---');
  const noToolsResp = await openai.chat.completions.create({
    model,
    messages: baseMessages(),
    n: 3,
    logprobs: true,
    top_logprobs: 5,
    temperature: 1.0,
  });
  console.log('response.model:', noToolsResp.model);
  for (const choice of noToolsResp.choices) {
    console.log(`\nChoice ${choice.index}:`);
    console.log('  content:', JSON.stringify(choice.message?.content));
    const content = choice.logprobs?.content || [];
    const first3 = content.slice(0, 3).map((t) => ({
      token: t.token,
      logprob: t.logprob,
      top_logprob_of_top: t.top_logprobs?.[0] ? { token: t.top_logprobs[0].token, logprob: t.top_logprobs[0].logprob } : null,
    }));
    console.log('  first 3 tokens top logprob:', JSON.stringify(first3));
  }

  console.log('\n' + '='.repeat(80));
  console.log('\nDONE. model id used (requested):', model, '| response.model examples above.');
}

main().catch((err) => {
  console.error('FATAL:', err?.status, err?.message || err);
  process.exit(1);
});

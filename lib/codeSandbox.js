// Runs model-written TypeScript against one saved table.
//
// The table is parsed inside the vm context. Host objects are not passed
// in. Building code from strings and Wasm are off. require, fetch, fs,
// and process are not bindings of that context. The only value that
// comes back is the JSON text of analyze().

import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const TIMEOUT_MS = 1000;
const MAX_SOURCE = 12000;
const MAX_RESULT = 20000;

const FORBIDDEN = /\b(process|require|fetch|XMLHttpRequest|WebSocket|Function|eval|WebAssembly|globalThis|global|module|exports|Buffer|setTimeout|setInterval|setImmediate|queueMicrotask|child_process|fs|import|Deno|Bun)\b/;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function extractTypeScript(text) {
  const source = String(text ?? '');
  const fence = source.match(/```(?:ts|typescript|js|javascript)?\s*([\s\S]*?)```/i);
  const code = (fence ? fence[1] : source).trim();
  if (!code.includes('function analyze') && !code.includes('analyze =')) return null;
  return code;
}

function teachingError(error) {
  const message = String(error?.message || error || 'The code did not finish.');
  const first = message.split('\n')[0].replace(/\s+/g, ' ').slice(0, 220);
  if (error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || /Script execution timed out/i.test(first)) {
    return 'That code ran too long. Ask for a smaller count.';
  }
  if (/Code generation from strings disallowed/i.test(first) || /WebAssembly is undefined/i.test(first)) {
    return 'That code tries to build new code, or to reach outside the table. This page does not allow that.';
  }
  if (/require is not defined|fetch is not defined|process is not defined|fs is not defined|WebSocket is not defined/i.test(first)) {
    return 'That code asks for the network or the disk. This page only counts the saved table.';
  }
  if (/not defined/i.test(first)) {
    return 'That code asks for something this page does not run. This page only counts the saved table.';
  }
  return `The code did not finish. ${first}`;
}

function gateSource(source) {
  const code = String(source ?? '').trim();
  if (!code) return { ok: false, error: 'The model did not write a function named analyze.' };
  if (code.length > MAX_SOURCE) return { ok: false, error: 'That code is too long. Ask for a smaller count.' };
  if (FORBIDDEN.test(code)) {
    return { ok: false, error: 'That code asks for the network or the disk. This page only counts the saved table.' };
  }
  return { ok: true, code };
}

export function runInSandbox(source, { constantName, rows, timeoutMs = TIMEOUT_MS } = {}) {
  if (!IDENTIFIER.test(constantName || '')) {
    return { ok: false, error: 'That table is not on this page.' };
  }
  const gated = gateSource(source);
  if (!gated.ok) return gated;

  let javascript = gated.code;
  try {
    javascript = stripTypeScriptTypes(gated.code, { mode: 'transform' });
  } catch {
    return { ok: false, error: 'That TypeScript could not be read. Ask again in different words.' };
  }
  const after = gateSource(javascript);
  if (!after.ok) return after;

  let dataLiteral;
  try {
    dataLiteral = JSON.stringify(JSON.stringify(rows));
  } catch {
    return { ok: false, error: 'The saved table could not be read.' };
  }

  const wrapped = `'use strict';
const console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const ${constantName} = JSON.parse(${dataLiteral});
${after.code}
if (typeof analyze !== 'function') throw new Error('Write a function named analyze.');
const __result = JSON.stringify(analyze());
if (typeof __result !== 'string' || __result.length > ${MAX_RESULT}) throw new Error('The result was too large.');
__result`;

  const context = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false },
  });
  try {
    const script = new vm.Script(wrapped, { filename: 'analyze.js' });
    const raw = script.runInContext(context, { timeout: timeoutMs, displayErrors: false });
    const value = JSON.parse(raw);
    if (value === undefined) return { ok: false, error: 'The code did not return a count.' };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: teachingError(error) };
  }
}

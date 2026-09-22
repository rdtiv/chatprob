// Colors a TypeScript snippet as it grows. Prism tokenizes synchronously,
// so each streamed slice can be painted without waiting for the fence.

import Prism from 'prismjs';
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-typescript.js';

const ROLE = {
  keyword: 'keyword',
  boolean: 'keyword',
  string: 'string',
  'template-string': 'string',
  char: 'string',
  regex: 'string',
  comment: 'comment',
  function: 'function',
  'function-variable': 'function',
  number: 'number',
  constant: 'number',
  builtin: 'type',
  'class-name': 'type',
  punctuation: 'punct',
  operator: 'punct',
};

// A quote or comment that has not closed yet still takes a color, so the
// block looks highlighted on the way in, not only after the fence ends.
function openDelimiter(source) {
  let i = 0;
  let state = 'code';
  let start = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '/') {
        state = 'line';
        start = i;
        i += 2;
        continue;
      }
      if (c === '/' && next === '*') {
        state = 'block';
        start = i;
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        state = c;
        start = i;
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }
    if (state === 'line') {
      if (c === '\n') state = 'code';
      i += 1;
      continue;
    }
    if (state === 'block') {
      if (c === '*' && next === '/') {
        state = 'code';
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === state) {
      state = 'code';
      i += 1;
      continue;
    }
    i += 1;
  }
  if (state === 'code') return null;
  return { role: state === 'line' || state === 'block' ? 'comment' : 'string', at: start };
}

function promoteFunctionNames(list) {
  const out = [];
  for (let index = 0; index < list.length; index += 1) {
    const piece = list[index];
    const next = list[index + 1];
    if (piece.role === 'keyword' && piece.text === 'function' && next?.role === 'plain') {
      const match = next.text.match(/^(\s+)([A-Za-z_$][\w$]*)([\s\S]*)$/);
      if (match) {
        out.push(piece);
        if (match[1]) out.push({ role: 'plain', text: match[1] });
        out.push({ role: 'function', text: match[2] });
        if (match[3]) out.push({ role: 'plain', text: match[3] });
        index += 1;
        continue;
      }
    }
    out.push(piece);
  }
  return out;
}

function pieces(tokens, wrap) {
  const out = [];
  for (const token of tokens) {
    if (typeof token === 'string') {
      if (token) out.push({ role: wrap || 'plain', text: token });
      continue;
    }
    const role = ROLE[token.type] || wrap || 'plain';
    if (Array.isArray(token.content)) {
      out.push(...pieces(token.content, role));
      continue;
    }
    const text = String(token.content ?? '');
    if (text) out.push({ role, text });
  }
  return out;
}

function compact(list) {
  const out = [];
  for (const piece of list) {
    const last = out[out.length - 1];
    if (last && last.role === piece.role) last.text += piece.text;
    else out.push({ role: piece.role, text: piece.text });
  }
  return out;
}

export function highlightTypeScript(source) {
  const text = String(source ?? '');
  if (!text) return [];
  const grammar = Prism.languages.typescript;
  if (!grammar) return [{ role: 'plain', text }];
  const open = openDelimiter(text);
  const head = open ? text.slice(0, open.at) : text;
  const list = promoteFunctionNames(pieces(head ? Prism.tokenize(head, grammar) : []));
  if (open) list.push({ role: open.role, text: text.slice(open.at) });
  return compact(list);
}

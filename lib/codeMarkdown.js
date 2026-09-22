// The write-up is markdown. Every number in it has to appear in the
// sandbox JSON. If the model adds a count that the run did not return,
// the page uses a table built only from that JSON.

const NUMBER = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;

export const NARRATIVE_SYSTEM = [
  'You explain a count that already ran.',
  'Write short markdown: two or three sentences, then one markdown table.',
  'Use only numbers that appear in the JSON result. Do not invent a count, a week, a percent, or a date.',
  'If the JSON does not say it, leave it out.',
  'Plain words. This is a lesson, not a prize.',
].join(' ');

export function numberValues(text) {
  const values = [];
  for (const match of String(text ?? '').matchAll(NUMBER)) {
    const value = Number(match[0].replace(/,/g, ''));
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

export function narrativeUsesOnlyRunNumbers(markdown, output) {
  const allowed = new Set(numberValues(JSON.stringify(output)));
  return numberValues(markdown).every((value) => allowed.has(value));
}

function labelKey(key) {
  const text = String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '/').replace(/\n/g, ' ');
}

function tableFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  if (!rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) return '';
  const headers = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key) && (row[key] == null || typeof row[key] !== 'object')) headers.push(key);
    }
  }
  if (!headers.length) return '';
  const lines = [
    `| ${headers.map(labelKey).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];
  for (const row of rows.slice(0, 12)) {
    lines.push(`| ${headers.map((key) => escapeCell(row[key] ?? '')).join(' | ')} |`);
  }
  return lines.join('\n');
}

export function fallbackMarkdown(output) {
  if (Array.isArray(output)) {
    const table = tableFromRows(output);
    return table ? `Counted from the run.\n\n${table}` : `The run returned ${JSON.stringify(output).slice(0, 2000)}`;
  }
  if (!output || typeof output !== 'object') {
    return `The run returned ${JSON.stringify(output)}`;
  }
  const lines = ['Counted from the run.', ''];
  const scalars = [];
  const tables = [];
  for (const [key, value] of Object.entries(output)) {
    if (Array.isArray(value)) {
      const table = tableFromRows(value);
      if (table) tables.push({ key, table });
    } else if (value == null || typeof value !== 'object') {
      scalars.push([key, value]);
    }
  }
  if (scalars.length) {
    lines.push('| What | Count |', '| --- | --- |');
    for (const [key, value] of scalars) lines.push(`| ${labelKey(key)} | ${escapeCell(value)} |`);
    lines.push('');
  }
  for (const table of tables) {
    lines.push(labelKey(table.key), '', table.table, '');
  }
  if (!scalars.length && !tables.length) {
    lines.push(JSON.stringify(output, null, 2).slice(0, 4000));
  }
  return lines.join('\n').trim();
}

export function markdownFromRun(draft, output) {
  const text = String(draft ?? '').trim();
  if (text && narrativeUsesOnlyRunNumbers(text, output)) {
    return { markdown: text, source: 'model' };
  }
  return { markdown: fallbackMarkdown(output), source: 'run' };
}

export function buildNarrativeMessages({ question, output }) {
  return [
    { role: 'system', content: NARRATIVE_SYSTEM },
    {
      role: 'user',
      content: JSON.stringify({ question, result: output }),
    },
  ];
}

export function markdownBlocks(source) {
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.trim().startsWith('|') && lines[index + 1] && /\|\s*-{3,}/.test(lines[index + 1])) {
      const header = splitRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      blocks.push({ type: 'h', text: line.replace(/^#{1,3}\s+/, '') });
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !lines[index].trim().startsWith('|')
      && !/^#{1,3}\s+/.test(lines[index])
      && !/^[-*]\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'p', text: paragraph.join(' ') });
  }
  return blocks;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

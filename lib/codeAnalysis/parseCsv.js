// Small CSV reader for the Code tab's saved tables. The files are
// synthetic and have no quoted commas, so a split is the whole parser.
// It still strips a header and blank lines. It does not evaluate cells.

export function parseCsv(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '').trim();
  if (!source) return [];
  const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = lines[0].split(',').map((cell) => cell.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
}

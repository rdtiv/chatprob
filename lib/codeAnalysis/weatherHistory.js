// Stored daily weather. The question asks what it is right now. The file
// cannot answer that: it has a last day, and the clock for the question
// is a fixed date in this module, not the server's clock and not a live
// weather call.

export const WEATHER_ASKED_AS_OF = '2026-09-22';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function num(row, key) {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Weather table has a bad ${key}`);
  }
  return value;
}

function utcDay(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function formatStoredDay(iso) {
  const [, month, day] = iso.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

export function analyzeWeatherHistory(rows, askedAsOf = WEATHER_ASKED_AS_OF) {
  const parsed = rows
    .map((row) => ({
      date: row.date,
      city: row.city,
      high: num(row, 'high_f'),
      low: num(row, 'low_f'),
      conditions: row.conditions,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!parsed.length) throw new Error('Weather table is empty');

  const cities = [...new Set(parsed.map((row) => row.city))];
  let best = [];
  let run = [];
  const flush = () => {
    if (run.length > best.length) best = run;
    run = [];
  };
  for (const row of parsed) {
    if (row.high >= 97) run.push(row);
    else flush();
  }
  flush();
  if (!best.length) throw new Error('Weather table has no hot stretch');

  const hotHighs = [...new Set(best.map((row) => row.high))];
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  const staleDays = Math.round((utcDay(askedAsOf) - utcDay(last.date)) / 86400000);

  const facts = {
    days: parsed.length,
    city: cities.length === 1 ? cities[0] : null,
    firstDate: first.date,
    lastDate: last.date,
    hotStart: best[0].date,
    hotEnd: best[best.length - 1].date,
    hotDays: best.length,
    hotHigh: hotHighs.length === 1 ? hotHighs[0] : null,
    lastHigh: last.high,
    lastConditions: last.conditions,
    askedAsOf,
    staleDays,
    answersRightNow: false,
  };

  const punchline = `This file is ${facts.days} stored days for ${facts.city}, through ${formatStoredDay(last.date)}. It remembers a hot stretch from ${formatStoredDay(best[0].date)} to ${formatStoredDay(best[best.length - 1].date)}, highs at ${facts.hotHigh}°, and a mild last day at ${last.high}°. It does not know right now. A stored table and a live look are different questions.`;

  return {
    facts,
    punchline,
    lines: [
      {
        label: 'Stored days',
        value: `${facts.days} days in ${facts.city}, ${formatStoredDay(first.date)} through ${formatStoredDay(last.date)}`,
      },
      {
        label: 'Hot stretch',
        value: `${formatStoredDay(best[0].date)}–${formatStoredDay(best[best.length - 1].date)}, highs at ${facts.hotHigh}°`,
      },
      {
        label: 'Last stored day',
        value: `${formatStoredDay(last.date)}, high ${last.high}°`,
      },
      {
        label: 'Right now',
        value: `Not in this file. Newest row is ${facts.staleDays} days behind ${formatStoredDay(askedAsOf)}.`,
      },
    ],
  };
}

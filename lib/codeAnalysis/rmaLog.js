// Twelve-week return log. Finds the three-week window where adhesive and
// clip take the largest share, then compares remake share in the first
// half of the log with the second, and repeat share inside that pile
// with the rest of the rows.

function num(row, key) {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Return table has a bad ${key}`);
  }
  return value;
}

function total(rows, pred = () => true) {
  return rows.reduce((sum, row) => (pred(row) ? sum + row.count : sum), 0);
}

export function analyzeRmaLog(rows) {
  const parsed = rows.map((row) => ({
    week: num(row, 'week'),
    part: row.part,
    disposition: row.disposition,
    repeat: row.repeat === 'yes',
    count: num(row, 'count'),
  }));

  const weeks = [...new Set(parsed.map((row) => row.week))].sort((a, b) => a - b);

  function windowShare(start) {
    const end = start + 2;
    const inWindow = parsed.filter((row) => row.week >= start && row.week <= end);
    const windowTotal = total(inWindow);
    const cluster = total(inWindow, (row) => row.part === 'adhesive' || row.part === 'clip');
    return {
      start,
      end,
      total: windowTotal,
      cluster,
      share: windowTotal ? cluster / windowTotal : 0,
    };
  }

  let best = null;
  for (const start of weeks) {
    if (!weeks.includes(start + 1) || !weeks.includes(start + 2)) continue;
    const stats = windowShare(start);
    if (!best || stats.share > best.share) best = stats;
  }
  if (!best) throw new Error('Return table needs three consecutive weeks');

  const firstHalf = parsed.filter((row) => row.week >= 1 && row.week <= 6);
  const lastHalf = parsed.filter((row) => row.week >= 7 && row.week <= 12);
  const remakeFirst = total(firstHalf, (row) => row.disposition === 'remake');
  const totalFirst = total(firstHalf);
  const remakeLast = total(lastHalf, (row) => row.disposition === 'remake');
  const totalLast = total(lastHalf);

  const inCluster = (row) => (
    row.week >= best.start
    && row.week <= best.end
    && (row.part === 'adhesive' || row.part === 'clip')
  );
  const clusterRows = parsed.filter(inCluster);
  const restRows = parsed.filter((row) => !inCluster(row));
  const clusterRepeats = total(clusterRows, (row) => row.repeat);
  const clusterTotal = total(clusterRows);
  const restRepeats = total(restRows, (row) => row.repeat);
  const restTotal = total(restRows);

  const facts = {
    clusterStart: best.start,
    clusterEnd: best.end,
    clusterCount: best.cluster,
    clusterWindowTotal: best.total,
    remakeFirstSix: remakeFirst,
    totalFirstSix: totalFirst,
    remakeLastSix: remakeLast,
    totalLastSix: totalLast,
    remakeShareRises: totalFirst > 0 && totalLast > 0 && (remakeLast / totalLast) > (remakeFirst / totalFirst),
    clusterRepeats,
    clusterTotal,
    restRepeats,
    restTotal,
    repeatsOverIndex: clusterTotal > 0 && restTotal > 0 && (clusterRepeats / clusterTotal) > (restRepeats / restTotal),
  };

  const punchline = `Weeks ${best.start}–${best.end} pile up on adhesive and clip: ${best.cluster} of ${best.total} returns those weeks. Remake’s share climbs from ${remakeFirst} of ${totalFirst} returns in the first six weeks to ${remakeLast} of ${totalLast} in the last six. Inside that adhesive-and-clip pile, ${clusterRepeats} of ${clusterTotal} had come back before. In the rest of the log, ${restRepeats} of ${restTotal} had.`;

  return {
    facts,
    punchline,
    lines: [
      {
        label: 'Adhesive and clip',
        value: `Weeks ${best.start}–${best.end}: ${best.cluster} of ${best.total} returns`,
      },
      {
        label: 'Remakes, first six weeks',
        value: `${remakeFirst} of ${totalFirst}`,
      },
      {
        label: 'Remakes, last six weeks',
        value: `${remakeLast} of ${totalLast}`,
      },
      {
        label: 'Repeats in that pile',
        value: `${clusterRepeats} of ${clusterTotal}`,
      },
      {
        label: 'Repeats in the rest',
        value: `${restRepeats} of ${restTotal}`,
      },
    ],
  };
}

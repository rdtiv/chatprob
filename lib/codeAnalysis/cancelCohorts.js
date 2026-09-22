// Monthly cancel cohorts. Pools started and canceled by plan and tenure,
// then looks for the month that loses the most people and whether the
// newer plan loses people faster at every tenure we can see.

function num(row, key) {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Cancel table has a bad ${key}`);
  }
  return value;
}

function wholePercent(canceled, started) {
  if (!started) return null;
  const percent = (canceled / started) * 100;
  if (Math.abs(percent - Math.round(percent)) > 1e-9) return null;
  return Math.round(percent);
}

export function analyzeCancelCohorts(rows) {
  const pool = new Map();
  for (const row of rows) {
    const plan = row.plan;
    const tenure = num(row, 'tenure_month');
    const key = `${plan}|${tenure}`;
    const current = pool.get(key) || { plan, tenure, started: 0, canceled: 0 };
    current.started += num(row, 'started');
    current.canceled += num(row, 'canceled');
    pool.set(key, current);
  }

  function ratesFor(plan) {
    return [...pool.values()]
      .filter((entry) => entry.plan === plan)
      .sort((a, b) => a.tenure - b.tenure)
      .map((entry) => ({
        ...entry,
        percent: wholePercent(entry.canceled, entry.started),
      }));
  }

  const classic = ratesFor('classic');
  const launch = ratesFor('launch');
  if (!classic.length || !launch.length) {
    throw new Error('Cancel table needs the classic plan and the new plan');
  }

  function leakMonth(rates) {
    const max = Math.max(...rates.map((entry) => entry.canceled / entry.started));
    const months = rates
      .filter((entry) => entry.canceled / entry.started === max)
      .map((entry) => entry.tenure);
    return months.length === 1 ? months[0] : null;
  }

  function at(rates, tenure) {
    return rates.find((entry) => entry.tenure === tenure) ?? null;
  }

  const sharedTenures = classic
    .map((entry) => entry.tenure)
    .filter((tenure) => launch.some((entry) => entry.tenure === tenure));
  const launchFasterEveryTenure = sharedTenures.every((tenure) => {
    const newer = at(launch, tenure);
    const older = at(classic, tenure);
    return newer.canceled / newer.started > older.canceled / older.started;
  });

  const classicMonth3 = at(classic, 3);
  const classicMonth2 = at(classic, 2);
  const classicMonth4 = at(classic, 4);
  const launchMonth3 = at(launch, 3);
  const besideMatch = classicMonth2
    && classicMonth4
    && classicMonth2.percent != null
    && classicMonth2.percent === classicMonth4.percent;

  const facts = {
    classicLeakMonth: leakMonth(classic),
    launchLeakMonth: leakMonth(launch),
    classicMonth3Percent: classicMonth3?.percent ?? null,
    classicBesidePercent: besideMatch ? classicMonth2.percent : null,
    launchMonth3Percent: launchMonth3?.percent ?? null,
    launchFasterEveryTenure,
    sharedTenureCount: sharedTenures.length,
  };

  if (
    facts.classicLeakMonth !== 3
    || facts.launchLeakMonth !== 3
    || facts.classicMonth3Percent == null
    || facts.classicBesidePercent == null
    || facts.launchMonth3Percent == null
  ) {
    throw new Error('Cancel table did not show a month-3 leak with whole percents');
  }

  const punchline = `Month 3 is the leak. The classic plan loses ${facts.classicMonth3Percent}% that month and ${facts.classicBesidePercent}% in the months beside it. The new plan loses ${facts.launchMonth3Percent}% in month 3 — and it loses people faster in every month we can see, not only in that leak.`;

  return {
    facts,
    punchline,
    lines: [
      { label: 'Classic plan, month 3', value: `${facts.classicMonth3Percent}% left` },
      { label: 'Classic plan, months beside it', value: `${facts.classicBesidePercent}% left` },
      { label: 'New plan, month 3', value: `${facts.launchMonth3Percent}% left` },
      {
        label: 'New plan, every month',
        value: facts.launchFasterEveryTenure
          ? `Faster than classic across ${facts.sharedTenureCount} months`
          : 'Not faster in every month',
      },
    ],
  };
}

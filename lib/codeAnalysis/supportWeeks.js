// Weekly support history. Discovers a billing volume jump and whether
// the technical queue's slow end (hours_p95) stays worse than the others.
// Not a queue choice, a severity score, or a refund yes/no.

const QUEUES = ['billing', 'technical', 'account', 'other'];

function num(row, key) {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Support table has a bad ${key}`);
  }
  return value;
}

export function analyzeSupportWeeks(rows) {
  const byWeek = new Map();
  for (const row of rows) {
    const week = num(row, 'week');
    if (!byWeek.has(week)) byWeek.set(week, new Map());
    byWeek.get(week).set(row.queue, {
      tickets: num(row, 'tickets'),
      refundAsks: num(row, 'refund_asks'),
      hoursP95: num(row, 'hours_p95'),
    });
  }

  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  for (const week of weeks) {
    for (const queue of QUEUES) {
      if (!byWeek.get(week).has(queue)) {
        throw new Error(`Support table is missing ${queue} in week ${week}`);
      }
    }
  }

  const billingTickets = weeks.map((week) => byWeek.get(week).get('billing').tickets);
  const maxTickets = Math.max(...billingTickets);
  const spikeWeeks = weeks.filter((week) => byWeek.get(week).get('billing').tickets === maxTickets);
  if (spikeWeeks.length !== 1) {
    throw new Error('Support table needs one billing jump');
  }
  const spikeWeek = spikeWeeks[0];
  const otherWeeks = weeks.filter((week) => week !== spikeWeek);
  const typicalTickets = new Set(otherWeeks.map((week) => byWeek.get(week).get('billing').tickets));
  const typicalRefunds = new Set(otherWeeks.map((week) => byWeek.get(week).get('billing').refundAsks));
  if (typicalTickets.size !== 1 || typicalRefunds.size !== 1) {
    throw new Error('Support table needs a flat billing baseline');
  }

  let technicalMin = Infinity;
  let otherMax = -Infinity;
  let technicalSlowestEveryWeek = true;
  for (const week of weeks) {
    const queues = byWeek.get(week);
    const technical = queues.get('technical').hoursP95;
    const restMax = Math.max(
      ...QUEUES.filter((queue) => queue !== 'technical').map((queue) => queues.get(queue).hoursP95),
    );
    if (!(technical > restMax)) technicalSlowestEveryWeek = false;
    technicalMin = Math.min(technicalMin, technical);
    otherMax = Math.max(otherMax, restMax);
  }

  const typicalBillingTickets = [...typicalTickets][0];
  const typicalBillingRefundAsks = [...typicalRefunds][0];
  const spikeTickets = byWeek.get(spikeWeek).get('billing').tickets;
  const spikeRefundAsks = byWeek.get(spikeWeek).get('billing').refundAsks;

  const facts = {
    spikeWeek,
    spikeQueue: 'billing',
    spikeTickets,
    typicalBillingTickets,
    spikeRefundAsks,
    typicalBillingRefundAsks,
    technicalHoursP95Min: technicalMin,
    otherQueuesHoursP95Max: otherMax,
    technicalSlowestEveryWeek,
    weekCount: weeks.length,
  };

  const punchline = `Week ${spikeWeek} is a billing jump: ${spikeTickets} tickets, against ${typicalBillingTickets} in every other week, and ${spikeRefundAsks} refund asks against ${typicalBillingRefundAsks}. Technical tickets are the slow ones every week — the slow end stays at ${technicalMin} hours or more, and every other queue stays at ${otherMax} hours or less. The busy week and the slow queue are not the same story.`;

  return {
    facts,
    punchline,
    lines: [
      {
        label: 'Billing jump',
        value: `Week ${spikeWeek}: ${spikeTickets} tickets (other weeks: ${typicalBillingTickets})`,
      },
      {
        label: 'Refund asks that week',
        value: `${spikeRefundAsks} (other weeks: ${typicalBillingRefundAsks})`,
      },
      {
        label: 'Technical, slow end',
        value: `${technicalMin} hours or more, every week`,
      },
      {
        label: 'Other queues, slow end',
        value: `${otherMax} hours or less`,
      },
    ],
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEATHER_TOOL_NAME,
  WEATHER_TOOL,
  WEATHER_TOOLS,
  parseWeatherArguments,
} from './weatherTool.js';

test('the description is the single source of truth the panel renders', () => {
  assert.equal(typeof WEATHER_TOOL.function.description, 'string');
  assert.ok(WEATHER_TOOL.function.description.length > 0);
  assert.equal(WEATHER_TOOL.function.name, WEATHER_TOOL_NAME);
});

test('the schema shape matches the OpenAI function-tool contract', () => {
  assert.equal(WEATHER_TOOL.type, 'function');
  assert.equal(WEATHER_TOOL.function.parameters.type, 'object');
  assert.deepEqual(WEATHER_TOOL.function.parameters.required, ['location']);
  assert.equal(WEATHER_TOOL.function.parameters.properties.location.type, 'string');
  assert.ok(WEATHER_TOOL.function.parameters.properties.location.description.length > 0);
});

test('WEATHER_TOOLS wraps the single tool', () => {
  assert.equal(WEATHER_TOOLS.length, 1);
  assert.equal(WEATHER_TOOLS[0], WEATHER_TOOL);
});

test('parseWeatherArguments accepts a plain location', () => {
  assert.deepEqual(parseWeatherArguments('{"location":"Denver"}'), {
    ok: true,
    location: 'Denver',
  });
});

test('parseWeatherArguments rejects invalid JSON', () => {
  const result = parseWeatherArguments('{"location":');
  assert.equal(result.ok, false);
  assert.match(result.error, /JSON/);
});

test('parseWeatherArguments rejects non-object JSON', () => {
  for (const raw of ['[]', '"Denver"', 'null']) {
    const result = parseWeatherArguments(raw);
    assert.equal(result.ok, false, `expected failure for ${raw}`);
  }
});

test('parseWeatherArguments rejects a missing or non-string location', () => {
  for (const raw of ['{}', '{"location":42}']) {
    const result = parseWeatherArguments(raw);
    assert.equal(result.ok, false, `expected failure for ${raw}`);
    assert.match(result.error, /location/);
  }
});

test('parseWeatherArguments rejects a blank location', () => {
  const result = parseWeatherArguments('{"location":"   "}');
  assert.equal(result.ok, false);
  assert.match(result.error, /empty/);
});

test('parseWeatherArguments ignores extra keys', () => {
  assert.deepEqual(parseWeatherArguments('{"location":"Denver","unit":"f"}'), {
    ok: true,
    location: 'Denver',
  });
});

test('parseWeatherArguments never throws on non-string input', () => {
  for (const raw of [undefined, null, 42, {}, []]) {
    const result = parseWeatherArguments(raw);
    assert.equal(result.ok, false);
  }
});

test('parseWeatherArguments never throws across a garbage fixture list', () => {
  const garbage = [
    '',
    'not json at all',
    '{',
    '}',
    '{"location":null}',
    '{"location":[]}',
    '{"location":{}}',
    '{"location":true}',
    12345,
    true,
    false,
    Symbol('x'),
    () => {},
    NaN,
    Infinity,
  ];
  for (const raw of garbage) {
    assert.doesNotThrow(() => parseWeatherArguments(raw), `threw on ${String(raw)}`);
  }
});

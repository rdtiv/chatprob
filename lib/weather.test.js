import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeather, normalizeLocation, WEATHER_TIMEOUT_MS, MAX_LOCATION_LENGTH } from './weather.js';

const SECRET = 'SECRET123';

function makeStub(response) {
  const calls = [];
  const stub = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(response);
  };
  return { calls, stub };
}

function okResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

function errorResponse(status, body) {
  return {
    ok: false,
    status,
    json: async () => {
      if (body === undefined) throw new Error('body is not valid JSON');
      return body;
    },
  };
}

const HAPPY_BODY = {
  location: { name: 'San Francisco', region: 'California' },
  current: {
    temp_f: 60,
    temp_c: 15.6,
    condition: { text: 'Partly cloudy' },
    wind_mph: 8.1,
    humidity: 72,
    feelslike_f: 58,
  },
};

test('normalizeLocation rejects non-string input', () => {
  for (const bad of [undefined, null, 42, {}]) {
    assert.throws(() => normalizeLocation(bad), /get_weather needs a location string/);
  }
});

test('getWeather rejects a non-string location without calling fetch', async () => {
  const { calls, stub } = makeStub(okResponse(HAPPY_BODY));
  for (const bad of [undefined, null, 42, {}]) {
    await assert.rejects(
      getWeather(bad, { apiKey: SECRET, fetchImpl: stub }),
      /get_weather needs a location string/,
    );
  }
  assert.equal(calls.length, 0);
});

test('getWeather rejects empty and whitespace-only location without calling fetch', async () => {
  const { calls, stub } = makeStub(okResponse(HAPPY_BODY));
  await assert.rejects(
    getWeather('', { apiKey: SECRET, fetchImpl: stub }),
    /get_weather needs a non-empty location/,
  );
  await assert.rejects(
    getWeather('   ', { apiKey: SECRET, fetchImpl: stub }),
    /get_weather needs a non-empty location/,
  );
  assert.equal(calls.length, 0);
});

test('getWeather rejects a location over the max length without calling fetch', async () => {
  const { calls, stub } = makeStub(okResponse(HAPPY_BODY));
  const tooLong = 'a'.repeat(MAX_LOCATION_LENGTH + 1);
  await assert.rejects(
    getWeather(tooLong, { apiKey: SECRET, fetchImpl: stub }),
    new RegExp(`too long \\(${MAX_LOCATION_LENGTH} characters max\\)`),
  );
  assert.equal(calls.length, 0);
});

test('getWeather rejects a location with a control character without calling fetch', async () => {
  const { calls, stub } = makeStub(okResponse(HAPPY_BODY));
  // A tab is whitespace, so it must sit inside the string, not at either
  // edge — trim() runs before the control-character check and would strip
  // (and silently hide) a leading or trailing one.
  await assert.rejects(
    getWeather('Den\tver', { apiKey: SECRET, fetchImpl: stub }),
    /control characters/,
  );
  assert.equal(calls.length, 0);
});

test('getWeather rejects when apiKey is missing without calling fetch', async () => {
  const { calls, stub } = makeStub(okResponse(HAPPY_BODY));
  await assert.rejects(
    getWeather('Boston', { apiKey: undefined, fetchImpl: stub }),
    /WEATHER_API_KEY/,
  );
  assert.equal(calls.length, 0);
});

test('getWeather maps the provider payload to the exact app shape', async () => {
  const { stub } = makeStub(okResponse(HAPPY_BODY));
  const weather = await getWeather('San Francisco', { apiKey: SECRET, fetchImpl: stub });
  assert.deepEqual(weather, {
    location: 'San Francisco',
    region: 'California',
    temp_f: 60,
    temp_c: 15.6,
    condition: 'Partly cloudy',
    wind_mph: 8.1,
    humidity: 72,
    feels_like_f: 58,
  });
});

test('getWeather builds the request URL with key and q params', async () => {
  const { calls, stub } = makeStub(okResponse(HAPPY_BODY));
  await getWeather('San José', { apiKey: SECRET, fetchImpl: stub });
  assert.equal(calls.length, 1);
  const { url } = calls[0];
  assert.ok(url.startsWith('https://api.weatherapi.com/v1/current.json?'));
  assert.ok(url.includes('key=SECRET123'));
  assert.ok(url.includes('q=San+Jos%C3%A9'));
});

test('getWeather never leaks the api key or host in error messages', async () => {
  const cases = [
    () => {
      const { stub } = makeStub(errorResponse(401, { error: { message: 'Invalid API key' } }));
      return getWeather('Boston', { apiKey: SECRET, fetchImpl: stub });
    },
    () => {
      const { stub } = makeStub(errorResponse(400, { error: { message: 'No matching location found.' } }));
      return getWeather('Nowhereville', { apiKey: SECRET, fetchImpl: stub });
    },
    () => {
      const stub = () => Promise.reject(new Error('network down'));
      return getWeather('Boston', { apiKey: SECRET, fetchImpl: stub });
    },
    () => {
      const response = {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('bad json');
        },
      };
      const { stub } = makeStub(response);
      return getWeather('Boston', { apiKey: SECRET, fetchImpl: stub });
    },
  ];

  for (const run of cases) {
    await assert.rejects(run(), (error) => {
      assert.ok(!error.message.includes(SECRET), `message leaked key: ${error.message}`);
      assert.ok(!error.message.includes('api.weatherapi.com'), `message leaked host: ${error.message}`);
      return true;
    });
  }
});

test('getWeather includes status, location, and provider detail on a 400', async () => {
  const { stub } = makeStub(errorResponse(400, { error: { message: 'No matching location found.' } }));
  await assert.rejects(
    getWeather('Nowhereville', { apiKey: SECRET, fetchImpl: stub }),
    (error) => {
      assert.ok(error.message.includes('400'));
      assert.ok(error.message.includes('Nowhereville'));
      assert.ok(error.message.includes('No matching location found.'));
      return true;
    },
  );
});

test('getWeather handles a 500 with an unparseable body without a trailing ": undefined"', async () => {
  const { stub } = makeStub(errorResponse(500, undefined));
  await assert.rejects(
    getWeather('Boston', { apiKey: SECRET, fetchImpl: stub }),
    (error) => {
      assert.ok(error.message.includes('500'));
      assert.ok(!error.message.includes(': undefined'));
      return true;
    },
  );
});

test('getWeather truncates a provider detail longer than 200 characters', async () => {
  const longMessage = 'x'.repeat(250);
  const { stub } = makeStub(errorResponse(400, { error: { message: longMessage } }));
  await assert.rejects(
    getWeather('Boston', { apiKey: SECRET, fetchImpl: stub }),
    (error) => {
      assert.ok(error.message.includes('x'.repeat(200)));
      assert.ok(!error.message.includes('x'.repeat(201)));
      return true;
    },
  );
});

test('getWeather reports a timeout when fetch rejects with an abort error', async () => {
  const stub = () => Promise.reject(new DOMException('The operation was aborted', 'TimeoutError'));
  await assert.rejects(
    getWeather('Boston', { apiKey: SECRET, fetchImpl: stub }),
    /timed out or could not connect/,
  );
});

test('getWeather passes an AbortSignal to fetch on a happy call', async () => {
  const { calls, stub } = makeStub(okResponse(HAPPY_BODY));
  await getWeather('Boston', { apiKey: SECRET, fetchImpl: stub });
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test('getWeather rejects when the body is missing current', async () => {
  const { stub } = makeStub(okResponse({ location: { name: 'Boston', region: 'MA' } }));
  await assert.rejects(
    getWeather('Boston', { apiKey: SECRET, fetchImpl: stub }),
    /unexpected response/,
  );
});

test('WEATHER_TIMEOUT_MS is 10 seconds by default', () => {
  assert.equal(WEATHER_TIMEOUT_MS, 10_000);
});

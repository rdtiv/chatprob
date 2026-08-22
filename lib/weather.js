// Port of tirocine's weather.ts (a teaching file) to plain JS with dependency
// injection so tests never touch the network. Five ideas carry over: `fetch`
// is the HTTP call, nothing more; `response.ok` is a check you cannot skip
// because fetch does not throw on a 401 or 404; the timeout is ours to set,
// not whatever undici's 300-second default happens to be; the provider's
// response shape and this app's Weather shape are two different things kept
// deliberately separate; and the location argument came from a language
// model's tool call, so it is untrusted input until normalizeLocation says
// otherwise.

export const WEATHER_TIMEOUT_MS = 10_000;
export const MAX_LOCATION_LENGTH = 120;

export function normalizeLocation(input) {
  if (typeof input !== 'string') {
    throw new Error('get_weather needs a location string');
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error('get_weather needs a non-empty location');
  }
  if (trimmed.length > MAX_LOCATION_LENGTH) {
    throw new Error(`get_weather location is too long (${MAX_LOCATION_LENGTH} characters max)`);
  }
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    throw new Error('get_weather location contains control characters');
  }
  return trimmed;
}

export async function getWeather(
  location,
  { fetchImpl = fetch, apiKey = process.env.WEATHER_API_KEY, timeoutMs = WEATHER_TIMEOUT_MS } = {},
) {
  // Validate before any network call — an untyped tool argument must never
  // become a real HTTP lookup for the literal city "undefined".
  const q = normalizeLocation(location);

  if (!apiKey) {
    throw new Error('WEATHER_API_KEY is not set');
  }

  const params = new URLSearchParams({ key: apiKey, q });
  const url = `https://api.weatherapi.com/v1/current.json?${params}`;

  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    // Don't re-throw or chain the original error: an undici cause chain can
    // carry `url`, and `url` carries the API key.
    throw new Error(`Weather lookup for "${q}" timed out or could not connect`);
  }

  if (!response.ok) {
    // Never interpolate `url` here — it contains the API key.
    const body = await response.json().catch(() => null);
    const detail = typeof body?.error?.message === 'string' ? body.error.message.slice(0, 200) : '';
    throw new Error(`Weather API returned ${response.status} for "${q}"${detail ? `: ${detail}` : ''}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Weather API sent an unexpected response for "${q}"`);
  }
  if (data?.location == null || data?.current == null) {
    throw new Error(`Weather API sent an unexpected response for "${q}"`);
  }

  return {
    location: data.location.name,
    region: data.location.region,
    temp_f: data.current.temp_f,
    temp_c: data.current.temp_c,
    condition: data.current.condition?.text,
    wind_mph: data.current.wind_mph,
    humidity: data.current.humidity,
    feels_like_f: data.current.feelslike_f,
  };
}

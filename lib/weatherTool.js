// Single source of truth for the weather tool schema handed to the model.
// Imported by both pages/api/chat.js and components/SamplingPanel.js, so this
// file must stay free of node-only APIs and env access.
//
// The name and description strings below are verbatim from the verified
// spike (scripts/tool-spike.mjs) — do not reword them. SamplingPanel renders
// WEATHER_TOOL.function.description directly, so this object is the only
// place the description string may exist.

export const WEATHER_TOOL_NAME = 'get_weather';

export const WEATHER_TOOL = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get current weather conditions for a city or place. Returns temperature in both Fahrenheit and Celsius, sky conditions, wind speed, humidity, and what the temperature feels like. Use this whenever the user asks about weather, temperature, or what to wear somewhere.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'A city name, e.g. "Denver" or "New York". US ZIP codes also work.',
        },
      },
      required: ['location'],
    },
  },
};

export const WEATHER_TOOLS = [WEATHER_TOOL];

// Parses the raw JSON-string arguments the model sends for a get_weather
// tool call. Never throws — always returns { ok: true, location } or
// { ok: false, error }.
export function parseWeatherArguments(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'The model sent no arguments' };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'The model sent arguments that are not valid JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'The model sent arguments that are not a JSON object' };
  }

  if (typeof parsed.location !== 'string') {
    return { ok: false, error: 'The model sent no location' };
  }

  if (parsed.location.trim() === '') {
    return { ok: false, error: 'The model sent an empty location' };
  }

  // Not trimmed on purpose: lib/weather.js normalizes at the network
  // boundary, so the two layers validate independently.
  return { ok: true, location: parsed.location };
}

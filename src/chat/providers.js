/**
 * AI providers (bring your own key). The key is only ever sent to the provider's own API.
 * Each provider: { id, label, needsKey, defaultModel, generate({ apiKey, model, system, messages, signal }) }
 */

class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

function describeHttpError(status, detail) {
  if (status === 401 || status === 403) return 'The API key was rejected. Check that it is correct and has access.';
  if (status === 429) return 'Rate limit reached. Wait a moment and try again.';
  if (status >= 500) return 'The AI service is having problems. Try again shortly.';
  return `The AI service returned an error (${status}). ${detail ?? ''}`.trim();
}

async function postJson(fetchImpl, url, headers, body, signal) {
  let response;
  try {
    response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ProviderError('Network error: could not reach the AI service.');
  }
  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    throw new ProviderError(describeHttpError(response.status, detail), response.status);
  }
  return response.json();
}

/** Anthropic Messages API, called directly from the browser. */
export function createAnthropicProvider(fetchImpl = globalThis.fetch?.bind(globalThis)) {
  return {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    needsKey: true,
    defaultModel: 'claude-sonnet-4-5',
    async generate({ apiKey, model, system, messages, signal }) {
      const data = await postJson(
        fetchImpl,
        'https://api.anthropic.com/v1/messages',
        {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        { model: model || this.defaultModel, max_tokens: 16000, system, messages },
        signal,
      );
      return (data.content ?? []).filter((part) => part.type === 'text').map((part) => part.text).join('');
    },
  };
}

/** OpenAI-compatible chat completions (OpenAI, OpenRouter, local servers, ...). */
export function createOpenAiCompatibleProvider({
  id = 'openai',
  label = 'OpenAI-compatible',
  baseUrl = 'https://api.openai.com/v1',
  defaultModel = 'gpt-4.1',
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  return {
    id,
    label,
    needsKey: true,
    defaultModel,
    async generate({ apiKey, model, system, messages, signal }) {
      const data = await postJson(
        fetchImpl,
        `${baseUrl.replace(/\/$/, '')}/chat/completions`,
        { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        { model: model || defaultModel, messages: [{ role: 'system', content: system }, ...messages] },
        signal,
      );
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}

/**
 * Offline demo "AI" so the whole chat -> validate -> preview -> keep flow can be tried
 * without a key. It answers from ready-made bundles (and declines nothing; the guard does that).
 * @param {{ guitarHero: object, themed: (prompt: string) => object }} bundles
 */
export function createDemoProvider(bundles) {
  return {
    id: 'demo',
    label: 'Demo (offline, no key needed)',
    needsKey: false,
    defaultModel: 'demo',
    async generate({ messages }) {
      const prompt = String(messages[0]?.content ?? '').split('\n\nHere is the current frontend')[0];
      const bundle = /guitar|rhythm|music|notes?|strum|band/i.test(prompt)
        ? bundles.guitarHero
        : bundles.themed(prompt);
      const parts = [`=== NAME: ${bundle.name} ===`];
      for (const [name, content] of Object.entries(bundle.files)) {
        parts.push(`=== FILE: ${name} ===\n${content}\n=== END FILE ===`);
      }
      return parts.join('\n');
    },
  };
}

export { ProviderError };

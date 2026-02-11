import { resolveBaseUrl } from './config';
import { ExtensionConfig, PromptPayload } from './types';

type JsonValue = Record<string, unknown>;

export async function generateCommitText(prompt: PromptPayload, config: ExtensionConfig): Promise<string> {
  ensureConfig(config);

  if (config.provider === 'gemini') {
    const text = await requestGemini(prompt, config);
    return sanitizeCommitText(text);
  }

  const text = await requestOpenAiCompatible(prompt, config);
  return sanitizeCommitText(text);
}

function ensureConfig(config: ExtensionConfig): void {
  if (!config.model) {
    throw new Error('Model is empty. Configure gitgathom.model.');
  }

  const hasAuthHeader =
    hasHeader(config.extraHeaders, 'authorization') || hasHeader(config.extraHeaders, 'x-api-key');

  if (config.provider === 'gemini' && !config.apiKey) {
    throw new Error('Gemini requires API key. Configure gitgathom.apiKey or GEMINI_API_KEY.');
  }

  if (config.provider !== 'gemini' && !config.apiKey && !hasAuthHeader) {
    throw new Error(
      'No API credential found. Configure gitgathom.apiKey or provide Authorization/X-Api-Key in gitgathom.extraHeaders.'
    );
  }

  if (config.provider === 'custom' && !resolveBaseUrl(config)) {
    throw new Error('Custom provider requires gitgathom.baseUrl.');
  }
}

async function requestOpenAiCompatible(prompt: PromptPayload, config: ExtensionConfig): Promise<string> {
  const baseUrl = resolveBaseUrl(config);
  if (!baseUrl) {
    throw new Error('Missing base URL for OpenAI-compatible provider.');
  }

  const endpoint = createOpenAiEndpoint(baseUrl, config.customRequestPath);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.extraHeaders
  };

  if (config.apiKey && !hasHeader(headers, 'authorization')) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.userPrompt }
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens
      })
    },
    config.requestTimeoutMs
  );

  const payload = (await response.json()) as JsonValue;
  const choices = payload.choices as Array<Record<string, unknown>> | undefined;
  const firstChoice = choices?.[0];
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map(part =>
        typeof part === 'object' && part && 'text' in part
          ? String((part as Record<string, unknown>).text ?? '')
          : ''
      )
      .join('\n')
      .trim();

    if (text) {
      return text;
    }
  }

  throw new Error('Provider returned no message content.');
}

async function requestGemini(prompt: PromptPayload, config: ExtensionConfig): Promise<string> {
  const baseUrl = resolveBaseUrl(config);
  if (!baseUrl) {
    throw new Error('Missing base URL for Gemini.');
  }

  const endpoint = `${baseUrl}/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const mergedPrompt = `${prompt.systemPrompt}\n\n${prompt.userPrompt}`;

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.extraHeaders
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: mergedPrompt }]
          }
        ],
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: config.maxTokens
        }
      })
    },
    config.requestTimeoutMs
  );

  const payload = (await response.json()) as JsonValue;
  const candidates = payload.candidates as Array<Record<string, unknown>> | undefined;
  const firstCandidate = candidates?.[0];
  const content = firstCandidate?.content as Record<string, unknown> | undefined;
  const parts = content?.parts as Array<Record<string, unknown>> | undefined;
  const text = parts
    ?.map(part => String(part.text ?? ''))
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Gemini returned no message content.');
  }

  return text;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${truncate(errorText, 600)}`);
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

function createOpenAiEndpoint(baseUrl: string, customPath: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  if (normalizedBase.endsWith('/chat/completions')) {
    return normalizedBase;
  }

  return `${normalizedBase}${customPath.startsWith('/') ? customPath : `/${customPath}`}`;
}

function sanitizeCommitText(raw: string): string {
  const withoutCodeFence = raw
    .replace(/^```[a-zA-Z]*\s*/m, '')
    .replace(/```$/m, '')
    .trim();

  const firstLine =
    withoutCodeFence
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line.length > 0) ?? '';

  const noSurroundingQuotes = firstLine.replace(/^['\"]+|['\"]+$/g, '').trim();

  if (!noSurroundingQuotes) {
    throw new Error('Generated commit message is empty.');
  }

  if (!isValidCommitLine(noSurroundingQuotes)) {
    throw new Error('Generated commit message is invalid or missing subject.');
  }

  return noSurroundingQuotes;
}

function isValidCommitLine(value: string): boolean {
  return /^[a-zA-Z]+(\([^)]+\))?:\s+\S+/.test(value);
}

function hasHeader(headers: Record<string, string>, keyToFind: string): boolean {
  const target = keyToFind.toLowerCase();
  return Object.keys(headers).some(key => key.toLowerCase() === target);
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

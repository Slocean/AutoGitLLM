import { resolveBaseUrl } from './config';
import {
  AiDebugSnapshot,
  ExtensionConfig,
  GenerateCommitResult,
  PromptPayload,
  Provider
} from './types';

type JsonValue = Record<string, unknown>;

const MAX_DEBUG_RESPONSE_LENGTH = 20_000;

export class AiRequestError extends Error {
  readonly debug: AiDebugSnapshot;

  constructor(message: string, debug: AiDebugSnapshot) {
    super(message);
    this.name = 'AiRequestError';
    this.debug = debug;
  }
}

export async function generateCommitText(
  prompt: PromptPayload,
  config: ExtensionConfig
): Promise<GenerateCommitResult> {
  ensureConfig(config);

  if (config.provider === 'gemini') {
    const { text, debug } = await requestGemini(prompt, config);
    return finalizeCommit(text, debug);
  }

  const { text, debug } = await requestOpenAiCompatible(prompt, config);
  return finalizeCommit(text, debug);
}

function finalizeCommit(rawText: string, debug: AiDebugSnapshot): GenerateCommitResult {
  debug.extractedText = rawText;

  try {
    const normalized = sanitizeCommitText(rawText);
    debug.normalizedCommitMessage = normalized;
    return {
      commitMessage: normalized,
      debug
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debug.error = message;
    throw new AiRequestError(message, debug);
  }
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

async function requestOpenAiCompatible(
  prompt: PromptPayload,
  config: ExtensionConfig
): Promise<{ text: string; debug: AiDebugSnapshot }> {
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

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: prompt.systemPrompt },
      { role: 'user', content: prompt.userPrompt }
    ],
    temperature: config.temperature
  };

  if (typeof config.maxTokens === 'number') {
    body.max_tokens = config.maxTokens;
  }

  const debug = createDebugSnapshot(config.provider, config.model, endpoint, headers, body);

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      },
      config.requestTimeoutMs
    );

    const responseText = await captureResponseDebug(response, debug);
    if (!response.ok) {
      throw new AiRequestError(`HTTP ${response.status}: ${truncate(responseText, 600)}`, debug);
    }

    const payload = parseJsonPayload(responseText, debug);
    const choices = payload.choices as Array<Record<string, unknown>> | undefined;
    const firstChoice = choices?.[0];
    const message = firstChoice?.message as Record<string, unknown> | undefined;
    const content = message?.content;

    if (typeof content === 'string') {
      return { text: content, debug };
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
        return { text, debug };
      }
    }

    throw new AiRequestError('Provider returned no message content.', debug);
  } catch (error) {
    throw asAiRequestError(error, debug);
  }
}

async function requestGemini(
  prompt: PromptPayload,
  config: ExtensionConfig
): Promise<{ text: string; debug: AiDebugSnapshot }> {
  const baseUrl = resolveBaseUrl(config);
  if (!baseUrl) {
    throw new Error('Missing base URL for Gemini.');
  }

  const endpoint = `${baseUrl}/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const mergedPrompt = `${prompt.systemPrompt}\n\n${prompt.userPrompt}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.extraHeaders
  };

  const generationConfig: Record<string, unknown> = {
    temperature: config.temperature
  };

  if (typeof config.maxTokens === 'number') {
    generationConfig.maxOutputTokens = config.maxTokens;
  }

  const body: Record<string, unknown> = {
    contents: [
      {
        role: 'user',
        parts: [{ text: mergedPrompt }]
      }
    ],
    generationConfig
  };

  const debug = createDebugSnapshot(config.provider, config.model, endpoint, headers, body);

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      },
      config.requestTimeoutMs
    );

    const responseText = await captureResponseDebug(response, debug);
    if (!response.ok) {
      throw new AiRequestError(`HTTP ${response.status}: ${truncate(responseText, 600)}`, debug);
    }

    const payload = parseJsonPayload(responseText, debug);
    const candidates = payload.candidates as Array<Record<string, unknown>> | undefined;
    const firstCandidate = candidates?.[0];
    const content = firstCandidate?.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    const text = parts
      ?.map(part => String(part.text ?? ''))
      .join('\n')
      .trim();

    if (!text) {
      throw new AiRequestError('Gemini returned no message content.', debug);
    }

    return { text, debug };
  } catch (error) {
    throw asAiRequestError(error, debug);
  }
}

async function captureResponseDebug(response: Response, debug: AiDebugSnapshot): Promise<string> {
  debug.responseStatus = response.status;
  debug.responseHeaders = collectHeaders(response.headers);
  const text = await response.text();
  debug.responseBody = truncate(text, MAX_DEBUG_RESPONSE_LENGTH);
  return text;
}

function parseJsonPayload(text: string, debug: AiDebugSnapshot): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    throw new AiRequestError('Provider returned invalid JSON payload.', debug);
  }
}

function asAiRequestError(error: unknown, debug: AiDebugSnapshot): AiRequestError {
  if (error instanceof AiRequestError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  debug.error = message;
  return new AiRequestError(message, debug);
}

function createDebugSnapshot(
  provider: Provider,
  model: string,
  endpoint: string,
  requestHeaders: Record<string, string>,
  requestBody: Record<string, unknown>
): AiDebugSnapshot {
  return {
    createdAt: new Date().toISOString(),
    provider,
    model,
    endpoint: maskSensitiveQuery(endpoint),
    requestHeaders: maskSensitiveHeaders(requestHeaders),
    requestBody
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function createOpenAiEndpoint(baseUrl: string, customPath: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = customPath.trim();

  if (normalizedBase.endsWith('/chat/completions')) {
    return normalizedBase;
  }

  if (!normalizedPath) {
    return `${normalizedBase}/chat/completions`;
  }

  return `${normalizedBase}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

function sanitizeCommitText(raw: string): string {
  const candidates = extractCandidates(raw);
  if (candidates.length === 0) {
    throw new Error('Generated commit message is empty.');
  }

  const normalizedCandidates = candidates
    .map(candidate => normalizeLocalizedType(normalizeCommitLine(candidate)))
    .filter(candidate => candidate.length > 0);

  const firstHeaderIndex = normalizedCandidates.findIndex(isValidCommitLine);
  if (firstHeaderIndex >= 0) {
    const header = normalizedCandidates[firstHeaderIndex];
    const bodyLines: string[] = [];

    for (let i = firstHeaderIndex + 1; i < normalizedCandidates.length; i += 1) {
      const line = normalizedCandidates[i];
      if (isValidCommitLine(line)) {
        break;
      }

      const normalizedBody = normalizeBodyLine(line);
      if (normalizedBody) {
        bodyLines.push(normalizedBody);
      }
    }

    return bodyLines.length > 0 ? `${header}\n${bodyLines.join('\n')}` : header;
  }

  const fallback = buildFallbackCommitLine(candidates);
  if (fallback && isValidCommitLine(fallback)) {
    return fallback;
  }

  throw new Error('Generated commit message is invalid or missing subject.');
}

function normalizeBodyLine(value: string): string {
  return value
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^['"`]+|['"`]+$/g, '')
    .trim();
}

function normalizeCommitLine(value: string): string {
  const embedded = value.match(/\b([a-zA-Z]+(?:\([^)]+\))?!?\s*[:\uFF1A]\s*.+)$/u)?.[1] ?? value;
  const strippedBullet = embedded.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
  const normalizedColon = strippedBullet.replace(/\uFF1A/g, ':');
  const collapsedPrefix = normalizedColon.replace(
    /^([a-zA-Z]+(?:\([^)]+\))?!?)\s*:\s*/,
    '$1: '
  );

  return collapsedPrefix.trim();
}

function extractCandidates(raw: string): string[] {
  const cleaned = raw
    .replace(/```[a-zA-Z]*\s*/g, '')
    .replace(/```/g, '')
    .trim();

  const lines = cleaned
    .split(/\r?\n/)
    .map(line =>
      line
        .replace(/^['"`]+|['"`]+$/g, '')
        .replace(/^commit\s*message\s*[:\uFF1A]\s*/i, '')
        .replace(/^\u63d0\u4ea4(?:\u4fe1\u606f|\u8bf4\u660e)\s*[:\uFF1A]\s*/u, '')
        .trim()
    )
    .filter(line => line.length > 0);

  return splitPackedCommitLines(lines);
}

function splitPackedCommitLines(lines: string[]): string[] {
  const output: string[] = [];

  for (const line of lines) {
    const starts: number[] = [];
    const regex = /\b[a-zA-Z]+(?:\([^)]+\))?!?\s*[:\uFF1A]\s*/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      starts.push(match.index);
    }

    if (starts.length <= 1) {
      output.push(line);
      continue;
    }

    for (let i = 0; i < starts.length; i += 1) {
      const start = starts[i];
      const end = i + 1 < starts.length ? starts[i + 1] : line.length;
      const segment = line.slice(start, end).trim();
      if (segment) {
        output.push(segment);
      }
    }
  }

  return output;
}

function normalizeLocalizedType(value: string): string {
  const mapping: Array<{ pattern: RegExp; type: string }> = [
    {
      pattern: /^(\u65b0\u589e|\u6dfb\u52a0|\u65b0\u529f\u80fd|\u529f\u80fd)\s*[:\uFF1A]\s*(.+)$/u,
      type: 'feat'
    },
    { pattern: /^(\u4fee\u590d|\u4fee\u6b63|\u89e3\u51b3)\s*[:\uFF1A]\s*(.+)$/u, type: 'fix' },
    { pattern: /^(\u91cd\u6784)\s*[:\uFF1A]\s*(.+)$/u, type: 'refactor' },
    { pattern: /^(\u4f18\u5316|\u6027\u80fd\u4f18\u5316)\s*[:\uFF1A]\s*(.+)$/u, type: 'perf' },
    { pattern: /^(\u6587\u6863)\s*[:\uFF1A]\s*(.+)$/u, type: 'docs' },
    { pattern: /^(\u6d4b\u8bd5)\s*[:\uFF1A]\s*(.+)$/u, type: 'test' },
    {
      pattern: /^(\u6784\u5efa|\u5de5\u7a0b|\u7ef4\u62a4|\u914d\u7f6e)\s*[:\uFF1A]\s*(.+)$/u,
      type: 'chore'
    },
    { pattern: /^(\u56de\u6eda|\u64a4\u9500)\s*[:\uFF1A]\s*(.+)$/u, type: 'revert' }
  ];

  for (const entry of mapping) {
    const match = value.match(entry.pattern);
    if (match) {
      const subject = match[2]?.trim();
      return `${entry.type}: ${subject}`;
    }
  }

  return value;
}

function buildFallbackCommitLine(candidates: string[]): string | undefined {
  const best = candidates
    .map(value => value.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .find(value => /[\p{L}\p{N}]/u.test(value));

  if (!best) {
    return undefined;
  }

  const subject = best
    .replace(/^[a-zA-Z]+(?:\([^)]+\))?!?\s*[:\uFF1A]\s*/u, '')
    .replace(/^['"`]+|['"`]+$/g, '')
    .trim();

  if (!subject) {
    return undefined;
  }

  return `${inferType(subject)}: ${subject}`;
}

function inferType(subject: string): string {
  const lower = subject.toLowerCase();

  if (/(fix|bug|error|\u4fee\u590d|\u4fee\u6b63|\u89e3\u51b3)/u.test(lower)) {
    return 'fix';
  }
  if (/(feat|add|\u65b0\u589e|\u6dfb\u52a0|\u529f\u80fd)/u.test(lower)) {
    return 'feat';
  }
  if (/(perf|optimi|\u6027\u80fd|\u63d0\u901f|\u52a0\u901f)/u.test(lower)) {
    return 'perf';
  }
  if (/(refactor|\u91cd\u6784)/u.test(lower)) {
    return 'refactor';
  }
  if (/(doc|readme|\u6587\u6863)/u.test(lower)) {
    return 'docs';
  }
  if (/(test|spec|\u6d4b\u8bd5)/u.test(lower)) {
    return 'test';
  }
  if (/(revert|\u56de\u6eda|\u64a4\u9500)/u.test(lower)) {
    return 'revert';
  }

  return 'chore';
}

function isValidCommitLine(value: string): boolean {
  const match = value.match(/^([a-zA-Z]+(?:\([^)]+\))?!?):\s*(.+)$/);
  if (!match) {
    return false;
  }

  const subject = match[2].trim();
  if (!subject) {
    return false;
  }

  return /[\p{L}\p{N}]/u.test(subject);
}

function hasHeader(headers: Record<string, string>, keyToFind: string): boolean {
  const target = keyToFind.toLowerCase();
  return Object.keys(headers).some(key => key.toLowerCase() === target);
}

function collectHeaders(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function maskSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (isSensitiveHeader(key)) {
      output[key] = maskSecret(value);
      continue;
    }

    output[key] = value;
  }

  return output;
}

function isSensitiveHeader(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized === 'authorization' || normalized.includes('api-key') || normalized.includes('token');
}

function maskSensitiveQuery(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    const sensitiveKeys = ['key', 'api_key', 'token'];

    for (const key of sensitiveKeys) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, '***');
      }
    }

    return url.toString();
  } catch {
    return endpoint.replace(/([?&](?:key|api_key|token)=)[^&]*/gi, '$1***');
  }
}

function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '***';
  }

  if (/^bearer\s+/i.test(trimmed)) {
    return 'Bearer ***';
  }

  return '***';
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

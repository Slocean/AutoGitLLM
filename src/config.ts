import * as vscode from 'vscode';
import { ExtensionConfig, Provider, UiLanguage } from './types';

const DEFAULT_BASE_URLS: Record<Exclude<Provider, 'custom'>, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  gemini: 'https://generativelanguage.googleapis.com',
  kimi: 'https://api.moonshot.cn/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4'
};

const DEFAULT_MODELS: Record<Provider, string> = {
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  gemini: 'gemini-2.0-flash',
  kimi: 'moonshot-v1-8k',
  glm: 'glm-4-flash',
  custom: 'gpt-4o-mini'
};

const PROVIDER_ENV_KEYS: Record<Provider, string> = {
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  gemini: 'GEMINI_API_KEY',
  kimi: 'MOONSHOT_API_KEY',
  glm: 'ZHIPU_API_KEY',
  custom: 'AUTOGITLLM_API_KEY'
};

const DEFAULT_PROMPTS: Record<UiLanguage, { system: string; rule: string }> = {
  zh: {
    system: '你是一名资深软件工程师，擅长撰写简洁、高质量的 Git 提交信息。',
    rule: '只生成一行提交信息，使用 Conventional Commits 格式：<type>(可选scope): <subject>。长度不超过72字符，使用祈使语气，不要句号，不要输出多余内容。'
  },
  en: {
    system: 'You are an expert software engineer who writes concise and high-quality git commit messages.',
    rule: 'Generate exactly one git commit message line using Conventional Commits format: <type>(optional-scope): <subject>. Keep it <= 72 characters, imperative mood, no trailing period, and output only the message.'
  }
};

export function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('autogitllm');
  const provider = getConfigValue<Provider>(cfg, 'provider', 'openai');
  const language = normalizeLanguage(getConfigValue<string>(cfg, 'language', 'zh'));
  const rawModel = getConfigValue<string>(cfg, 'model', '').trim();
  const rawSystemPrompt = getConfigValue<string>(cfg, 'systemPrompt', '').trim();
  const rawRuleTemplate = getConfigValue<string>(cfg, 'ruleTemplate', '').trim();
  const rawApiKey = getConfigValue<string>(cfg, 'apiKey', '').trim();

  return {
    language,
    provider,
    model: rawModel || DEFAULT_MODELS[provider],
    apiKey: resolveApiKey(provider, rawApiKey),
    baseUrl: getConfigValue<string>(cfg, 'baseUrl', '').trim(),
    customRequestPath: ensureLeadingSlash(getConfigValue<string>(cfg, 'customRequestPath', '/chat/completions')),
    extraHeaders: parseHeaders(getConfigValue<string>(cfg, 'extraHeaders', '{}')),
    temperature: clamp(getConfigValue<number>(cfg, 'temperature', 0.2), 0, 2),
    maxTokens: Math.max(16, Math.floor(getConfigValue<number>(cfg, 'maxTokens', 120))),
    requestTimeoutMs: Math.max(3000, Math.floor(getConfigValue<number>(cfg, 'requestTimeoutMs', 25000))),
    commandTimeoutMs: Math.max(3000, Math.floor(getConfigValue<number>(cfg, 'commandTimeoutMs', 12000))),
    includeOnlyStaged: getConfigValue<boolean>(cfg, 'includeOnlyStaged', false),
    maxDiffBytes: Math.max(4096, Math.floor(getConfigValue<number>(cfg, 'maxDiffBytes', 120000))),
    systemPrompt: rawSystemPrompt || DEFAULT_PROMPTS[language].system,
    ruleTemplate: rawRuleTemplate || DEFAULT_PROMPTS[language].rule,
    additionalRules: getConfigValue<string>(cfg, 'additionalRules', ''),
    copyToClipboard: getConfigValue<boolean>(cfg, 'copyToClipboard', false)
  };
}

export function resolveBaseUrl(config: ExtensionConfig): string {
  if (config.baseUrl) {
    return stripTrailingSlashes(config.baseUrl);
  }

  if (config.provider === 'custom') {
    return '';
  }

  return DEFAULT_BASE_URLS[config.provider];
}

export function getDefaultModel(provider: Provider): string {
  return DEFAULT_MODELS[provider];
}

export function normalizeLanguage(value: string | undefined): UiLanguage {
  return value === 'en' ? 'en' : 'zh';
}

function getConfigValue<T>(cfg: vscode.WorkspaceConfiguration, key: string, fallback: T): T {
  const inspected = cfg.inspect<T>(key);
  if (!inspected) {
    return fallback;
  }
  if (inspected.globalValue !== undefined) {
    return inspected.globalValue;
  }
  if (inspected.workspaceFolderValue !== undefined) {
    return inspected.workspaceFolderValue;
  }
  if (inspected.workspaceValue !== undefined) {
    return inspected.workspaceValue;
  }
  return inspected.defaultValue ?? fallback;
}

function resolveApiKey(provider: Provider, configuredKey: string): string {
  if (configuredKey) {
    return configuredKey;
  }

  const providerKey = process.env[PROVIDER_ENV_KEYS[provider]]?.trim();
  if (providerKey) {
    return providerKey;
  }

  return process.env.AUTOGITLLM_API_KEY?.trim() ?? '';
}

function parseHeaders(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const output: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        output[key] = value;
      }
    }

    return output;
  } catch {
    return {};
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ensureLeadingSlash(value: string): string {
  if (!value) {
    return '/chat/completions';
  }
  return value.startsWith('/') ? value : `/${value}`;
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

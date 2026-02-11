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
    system: `你是一个资深软件工程师，擅长编写高质量 Git Commit Message。`,
    rule: `
        请根据我提供的「代码改动描述」生成规范的提交信息，要求：

        【整体规范】
        - 使用 Conventional Commits 规范
        - 必须包含 emoji
        - 语言：简体中文
        - 风格：专业、清晰、简洁
        - 不要出现多余解释

        【格式要求】
        <type>(<scope>): <subject> <emoji>

        <body>
        - 使用条目列出关键改动
        - 每条一句话，精炼描述技术点
        - 若无详细内容可省略 body

        <footer>
        - 若存在 BREAKING CHANGE 必须说明
        - 若有关联 issue，使用 Closes #xxx

        【type 类型参考】
        - feat ✨ 新功能
        - fix 🐛 修复 bug
        - refactor ♻️ 重构
        - perf ⚡ 性能优化
        - docs 📝 文档
        - style 💄 代码格式
        - test ✅ 测试
        - chore 🔧 构建/工具
        - ci 👷 CI/CD
        - revert ⏪ 回滚

        【emoji 规则】
        - emoji 必须与 type 语义一致
        - 只在 subject 末尾放 1 个 emoji

        【输出要求】
        - 只输出最终 commit message
        - 不要解释
        - 长度不超过72个字
    `
  },
  en: {
    system: `You are a senior software engineer skilled at writing high-quality Git commit messages.`,
    rule: `
        Based on the provided "code change description", generate a well-structured commit message with the following requirements:

        [General Rules]
        - Follow the Conventional Commits specification
        - Must include an emoji
        - Language: English
        - Tone: professional, clear, and concise
        - Do NOT include any extra explanations

        [Format]
        <type>(<scope>): <subject> <emoji>

        <body>
        - Use bullet points to list key changes
        - Each bullet must be one concise technical sentence
        - Omit the body if no extra details are needed

        <footer>
        - Include BREAKING CHANGE if applicable
        - Reference related issues using: Closes #xxx

        [Allowed Types]
        - feat ✨ New feature
        - fix 🐛 Bug fix
        - refactor ♻️ Code refactoring
        - perf ⚡ Performance improvement
        - docs 📝 Documentation
        - style 💄 Code style/formatting
        - test ✅ Tests
        - chore 🔧 Build/tools/maintenance
        - ci 👷 CI/CD
        - revert ⏪ Revert

        [Emoji Rules]
        - Emoji must match the semantic meaning of the type
        - Only ONE emoji at the end of the subject line

        [Output Rules]
        - Output ONLY the final commit message
        - Do NOT add explanations or commentary
        - Length must not exceed 72 characters

    `
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

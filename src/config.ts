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
  custom: 'GITFATHOM_API_KEY'
};

const TRANSLATED_EN_RULE_TEMPLATE = `
        # Git Commit Message Style Guide
        Commit messages must follow Conventional Commits and include gitmoji.

        ## 1. Format Requirements
        <gitmoji> <type>(<scope>): <subject>
        <body>
        <footer>

        ## 2\. Field Details
        ### 📌 gitmoji (required)
        Add an appropriate gitmoji based on commit type. For example:
          - ✨ 'feat'
          - 🐛 'fix'
          - 📝 'docs'
          - 🎨 'style'
          - ♻️ 'refactor'
          - ✅ 'test'
          - 🔧 'chore'

        ### 📌 type (required)

        Must be one of the following types:
          - 'feat': New feature
          - 'fix': Bug fix
          - 'docs': Documentation changes
          - 'style': Code formatting changes (no logic impact)
          - 'refactor': Refactoring (neither bug fixing nor feature adding)
          - 'test': Test code
          - 'chore': Build/dependency changes

        ### 📌 scope (required)
        Affected scope; describe which specific module this change impacts.

        ### 📌 subject (required)
          - **Language**: Use English.
          - **Tense**: Use past tense verbs (e.g. fixed, added).
          - **Limit**: Within 100 characters, detailed but focused.

        ### 📌 body (required)
        Explain the concrete changes and rationale in detail; line breaks are allowed.

        ### 📌 footer (required)
        Link related issue (e.g. 'Closes #123') or mark 'BREAKING CHANGE'.

        ## 3\. Example
        ✨ feat(auth): added oauth2 login support
                        - integrated Google OAuth2
                        - added login page UI components
`;

const DEFAULT_PROMPTS: Record<UiLanguage, { system: string; rule: string }> = {
  zh: {
    system: `你是一个资深软件工程师，擅长编写高质量 Git Commit Message。`,
    rule: `
            # Git 提交消息规范指南
            提交消息必须遵循 Conventional Commits 规范，并结合 gitmoji。

            ## 1. 格式要求
            <gitmoji> <type>(<scope>): <subject>
            <body>
            <footer>
            ## 2\. 字段说明
            ### 📌 gitmoji (必填)
            根据提交类型添加一个合适的 gitmoji。例如：
              - ✨ 'feat'
              - 🐛 'fix'
              - 📝 'docs'
              - 🎨 'style'
              - ♻️ 'refactor'
              - ✅ 'test'
              - 🔧 'chore'
            ### 📌 type (必填)

            必须是以下类型之一：
              - 'feat': 新功能
              - 'fix': Bug 修复
              - 'docs': 文档变更
              - 'style': 代码格式（不影响逻辑的变动）
              - 'refactor': 重构（既不修复错误也不添加功能）
              - 'test': 测试代码
              - 'chore': 构建/依赖变更

            ### 📌 scope (必填)
            影响范围，描述此次修改对项目具体模块产生的作用。
            ### 📌 subject (必填)
              - **语言**: 使用中文生成消息。
              - **时态**: 动词使用过去式 (如 fixed, added)。
              - **限制**: 100 字符以内，详细的同时提取重点。

            ### 📌 body (必填)
            详细说明具体更改的内容及原因，可以进行换行。

            ### 📌 footer (必填)
            关联相关的 issue (如 'Closes #123') 或标注 'BREAKING CHANGE'。
            ## 3\. 示例
            ✨ feat(auth): added oauth2 登录支持
                            -实现谷歌 OAuth2 集成
                            -添加登录页面 UI 组件
    `
  },
  en: {
    system: `You are a senior software engineer skilled at writing high-quality Git commit messages.`,
    rule: TRANSLATED_EN_RULE_TEMPLATE
  }
};

export function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('gitgathom');
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
    maxTokens: parseOptionalMaxTokens(getConfigValue<number | null>(cfg, 'maxTokens', null)),
    requestTimeoutMs: Math.max(3000, Math.floor(getConfigValue<number>(cfg, 'requestTimeoutMs', 25000))),
    commandTimeoutMs: Math.max(3000, Math.floor(getConfigValue<number>(cfg, 'commandTimeoutMs', 12000))),
    includeOnlyStaged: getConfigValue<boolean>(cfg, 'includeOnlyStaged', false),
    maxChangedFiles: Math.max(1, Math.floor(getConfigValue<number>(cfg, 'maxChangedFiles', 30))),
    truncateDiff: getConfigValue<boolean>(cfg, 'truncateDiff', true),
    maxDiffBytes: Math.max(4096, Math.floor(getConfigValue<number>(cfg, 'maxDiffBytes', 120000))),
    systemPrompt: rawSystemPrompt || DEFAULT_PROMPTS[language].system,
    ruleTemplate: rawRuleTemplate || DEFAULT_PROMPTS[language].rule,
    additionalRules: getConfigValue<string>(cfg, 'additionalRules', ''),
    copyToClipboard: getConfigValue<boolean>(cfg, 'copyToClipboard', false),
    debugView: getConfigValue<boolean>(cfg, 'debugView', false)
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
  if (inspected.workspaceFolderValue !== undefined) {
    return inspected.workspaceFolderValue;
  }
  if (inspected.workspaceValue !== undefined) {
    return inspected.workspaceValue;
  }
  if (inspected.globalValue !== undefined) {
    return inspected.globalValue;
  }
  return inspected.defaultValue ?? fallback;
}

function parseOptionalMaxTokens(value: number | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.floor(value);
  if (normalized <= 0) {
    return null;
  }

  return Math.max(16, normalized);
}

function resolveApiKey(provider: Provider, configuredKey: string): string {
  if (configuredKey) {
    return configuredKey;
  }

  const providerKey = process.env[PROVIDER_ENV_KEYS[provider]]?.trim();
  if (providerKey) {
    return providerKey;
  }

  return process.env.GITFATHOM_API_KEY?.trim() ?? '';
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

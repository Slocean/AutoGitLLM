import { Provider, UiLanguage } from './types';

type MessageKey =
  | 'gitUnavailable'
  | 'noRepo'
  | 'progressTitle'
  | 'noChanges'
  | 'generated'
  | 'failedPrefix'
  | 'setupMissingBaseUrl'
  | 'setupMissingCredential'
  | 'actionOpenSetup'
  | 'actionOpenSettings'
  | 'actionConfigureApiKey'
  | 'actionConfigureHeaders'
  | 'actionConfigureBaseUrl'
  | 'actionConfigureProvider'
  | 'wizardLanguagePlaceholder'
  | 'wizardProviderPlaceholder'
  | 'wizardModelPrompt'
  | 'wizardModelPlaceholder'
  | 'wizardApiKeyPrompt'
  | 'wizardApiKeyPlaceholder'
  | 'wizardBaseUrlPrompt'
  | 'wizardBaseUrlPlaceholder'
  | 'wizardBaseUrlRequired'
  | 'wizardPathPrompt'
  | 'wizardPathPlaceholder'
  | 'wizardHeadersPrompt'
  | 'wizardHeadersPlaceholder'
  | 'wizardHeadersInvalid'
  | 'wizardClipboardPlaceholder'
  | 'wizardClipboardYes'
  | 'wizardClipboardNo'
  | 'wizardSaved'
  | 'wizardCancelled';

const MESSAGES: Record<UiLanguage, Record<MessageKey, string>> = {
  zh: {
    gitUnavailable: 'VS Code 的 Git 扩展不可用或已禁用。',
    noRepo: '当前工作区没有检测到 Git 仓库。',
    progressTitle: 'GitFathom：正在生成提交信息',
    noChanges: '当前仓库没有变更。',
    generated: '已生成提交信息并填入 Source Control 输入框。',
    failedPrefix: 'GitFathom 执行失败：',
    setupMissingBaseUrl: '{provider} 尚未配置完整，请先设置 gitgathom.baseUrl。',
    setupMissingCredential:
      '{provider} 缺少凭证，请先配置 gitgathom.apiKey（或在兼容厂商里用 gitgathom.extraHeaders）。',
    actionOpenSetup: '打开配置向导',
    actionOpenSettings: '打开设置',
    actionConfigureApiKey: '配置 API Key',
    actionConfigureHeaders: '配置额外请求头',
    actionConfigureBaseUrl: '配置 Base URL',
    actionConfigureProvider: '配置厂商',
    wizardLanguagePlaceholder: '第 1 步：选择语言',
    wizardProviderPlaceholder: '第 2 步：选择 AI 厂商',
    wizardModelPrompt: '第 3 步：输入模型名',
    wizardModelPlaceholder: '例如 gpt-4o-mini / deepseek-chat / gemini-2.0-flash',
    wizardApiKeyPrompt: '第 4 步：输入 API Key（留空则保持当前值）',
    wizardApiKeyPlaceholder: '以 sk-... 或其它厂商 key 开头',
    wizardBaseUrlPrompt: '第 5 步：配置 Base URL（留空使用厂商默认）',
    wizardBaseUrlPlaceholder: '例如 https://api.openai.com/v1 或第三方中转地址',
    wizardBaseUrlRequired: 'custom 模式必须配置 Base URL。',
    wizardPathPrompt: '第 6 步：配置请求路径（OpenAI 兼容厂商常用 /chat/completions）',
    wizardPathPlaceholder: '例如 /chat/completions',
    wizardHeadersPrompt: '第 7 步：配置额外请求头 JSON（可用于第三方中转，留空=清空）',
    wizardHeadersPlaceholder: '例如 {"X-Api-Key":"xxx"}',
    wizardHeadersInvalid: '请输入合法 JSON 对象，例如 {"X-Api-Key":"xxx"}',
    wizardClipboardPlaceholder: '第 8 步：是否复制到剪贴板？',
    wizardClipboardYes: '是，复制',
    wizardClipboardNo: '否，不复制',
    wizardSaved: '配置已保存。',
    wizardCancelled: '已取消配置。'
  },
  en: {
    gitUnavailable: 'Git extension is unavailable or disabled in VS Code.',
    noRepo: 'No Git repository found in the current workspace.',
    progressTitle: 'GitFathom: Generating commit message',
    noChanges: 'No changes detected in this repository.',
    generated: 'Commit message generated and filled into Source Control input.',
    failedPrefix: 'GitFathom failed: ',
    setupMissingBaseUrl: '{provider} is not fully configured. Please set gitgathom.baseUrl first.',
    setupMissingCredential:
      '{provider} credential is missing. Configure gitgathom.apiKey (or gitgathom.extraHeaders for compatible providers).',
    actionOpenSetup: 'Open setup wizard',
    actionOpenSettings: 'Open settings',
    actionConfigureApiKey: 'Configure API key',
    actionConfigureHeaders: 'Configure extra headers',
    actionConfigureBaseUrl: 'Configure base URL',
    actionConfigureProvider: 'Configure provider',
    wizardLanguagePlaceholder: 'Step 1: Select language',
    wizardProviderPlaceholder: 'Step 2: Select AI provider',
    wizardModelPrompt: 'Step 3: Enter model name',
    wizardModelPlaceholder: 'e.g. gpt-4o-mini / deepseek-chat / gemini-2.0-flash',
    wizardApiKeyPrompt: 'Step 4: Enter API key (leave empty to keep current value)',
    wizardApiKeyPlaceholder: 'Starts with sk-... or provider-specific key',
    wizardBaseUrlPrompt: 'Step 5: Configure base URL (empty = provider default)',
    wizardBaseUrlPlaceholder: 'e.g. https://api.openai.com/v1 or third-party gateway',
    wizardBaseUrlRequired: 'Base URL is required in custom mode.',
    wizardPathPrompt: 'Step 6: Configure request path (OpenAI-compatible providers often use /chat/completions)',
    wizardPathPlaceholder: 'e.g. /chat/completions',
    wizardHeadersPrompt: 'Step 7: Configure extra headers JSON (for third-party gateways, empty = clear)',
    wizardHeadersPlaceholder: 'e.g. {"X-Api-Key":"xxx"}',
    wizardHeadersInvalid: 'Please provide a valid JSON object, e.g. {"X-Api-Key":"xxx"}',
    wizardClipboardPlaceholder: 'Step 8: Copy generated message to clipboard?',
    wizardClipboardYes: 'Yes, copy',
    wizardClipboardNo: 'No, keep in SCM only',
    wizardSaved: 'Configuration saved.',
    wizardCancelled: 'Setup cancelled.'
  }
};

const PROVIDER_LABELS: Record<UiLanguage, Record<Provider, string>> = {
  zh: {
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    gemini: 'Gemini',
    kimi: 'Kimi',
    glm: 'GLM',
    custom: '自定义兼容厂商'
  },
  en: {
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    gemini: 'Gemini',
    kimi: 'Kimi',
    glm: 'GLM',
    custom: 'Custom compatible provider'
  }
};

export function t(language: UiLanguage, key: MessageKey, vars: Record<string, string> = {}): string {
  const template = MESSAGES[language][key];
  return template.replace(/\{(\w+)\}/g, (_, varName: string) => vars[varName] ?? '');
}

export function providerLabel(language: UiLanguage, provider: Provider): string {
  return PROVIDER_LABELS[language][provider];
}

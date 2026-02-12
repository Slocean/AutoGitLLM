export type Provider = "openai" | "deepseek" | "gemini" | "kimi" | "glm" | "custom";
export type UiLanguage = "zh" | "en";

export interface ExtensionConfig {
  language: UiLanguage;
  provider: Provider;
  model: string;
  apiKey: string;
  baseUrl: string;
  customRequestPath: string;
  extraHeaders: Record<string, string>;
  temperature: number;
  maxTokens: number | null;
  requestTimeoutMs: number;
  commandTimeoutMs: number;
  includeOnlyStaged: boolean;
  maxChangedFiles: number;
  truncateDiff: boolean;
  maxDiffBytes: number;
  systemPrompt: string;
  ruleTemplate: string;
  additionalRules: string;
  copyToClipboard: boolean;
  debugView: boolean;
}

export interface ChangeSnapshot {
  status: string;
  diff: string;
  wasTruncated: boolean;
  wasFileLimited: boolean;
  totalChangedFiles: number;
  includedChangedFiles: number;
}

export interface PromptPayload {
  systemPrompt: string;
  userPrompt: string;
}

export interface AiDebugSnapshot {
  createdAt: string;
  provider: Provider;
  model: string;
  endpoint: string;
  requestHeaders: Record<string, string>;
  requestBody: Record<string, unknown>;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  extractedText?: string;
  normalizedCommitMessage?: string;
  error?: string;
}

export interface GenerateCommitResult {
  commitMessage: string;
  debug: AiDebugSnapshot;
}

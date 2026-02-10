export type Provider = "openai" | "deepseek" | "gemini" | "kimi" | "glm" | "custom";

export interface ExtensionConfig {
  provider: Provider;
  model: string;
  apiKey: string;
  baseUrl: string;
  customRequestPath: string;
  extraHeaders: Record<string, string>;
  temperature: number;
  maxTokens: number;
  requestTimeoutMs: number;
  commandTimeoutMs: number;
  includeOnlyStaged: boolean;
  maxDiffBytes: number;
  systemPrompt: string;
  ruleTemplate: string;
  additionalRules: string;
  copyToClipboard: boolean;
}

export interface ChangeSnapshot {
  status: string;
  diff: string;
  wasTruncated: boolean;
}

export interface PromptPayload {
  systemPrompt: string;
  userPrompt: string;
}

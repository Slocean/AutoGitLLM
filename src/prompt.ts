import { ChangeSnapshot, ExtensionConfig, PromptPayload } from './types';

export function buildPrompt(snapshot: ChangeSnapshot, config: ExtensionConfig): PromptPayload {
  const sections: string[] = [];

  sections.push('Task: Create one git commit message based on the repository changes.');
  sections.push(`Rules:\n${config.ruleTemplate}`);

  if (config.additionalRules.trim()) {
    sections.push(`Additional rules:\n${config.additionalRules.trim()}`);
  }

  if (config.language === 'zh') {
    sections.push('语言要求：输出必须为简体中文。');
    // sections.push("输出约束：\n- 只输出一行\n- 不要使用 markdown\n- 不要加引号\n- 冒号后必须有主题内容");
  } else {
    sections.push('Language requirement: Output must be in English.');
    sections.push(
      "Output constraints:\n- Return a single line only\n- Do not use markdown\n- Do not wrap in quotes\n- Subject must exist after ':'"
    );
  }

  if (snapshot.status.trim()) {
    sections.push(`Git status (short):\n${snapshot.status}`);
  }

  sections.push(`Git diff:\n${snapshot.diff || '(no diff provided)'}`);

  if (snapshot.wasTruncated) {
    sections.push('Note: Diff content was truncated for performance limits.');
  }

  return {
    systemPrompt: config.systemPrompt,
    userPrompt: sections.join('\n\n')
  };
}

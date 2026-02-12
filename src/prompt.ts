import { ChangeSnapshot, ExtensionConfig, PromptPayload } from './types';

export function buildPrompt(snapshot: ChangeSnapshot, config: ExtensionConfig): PromptPayload {
  const sections: string[] = [];

  sections.push('Task: Create one or more git commit subjects based on the repository changes.');
  sections.push(`Rules:\n${config.ruleTemplate}`);

  if (config.additionalRules.trim()) {
    sections.push(`Additional rules:\n${config.additionalRules.trim()}`);
  }

  if (config.language === 'zh') {
    sections.push('语言要求：输出必须为简体中文。');
    sections.push(
      '输出约束:\n- 每行输出 1 条合法提交主题，可输出多行\n- 不要使用 markdown\n- 不要加引号\n- 冒号后必须有主题内容\n- 主题必须具体，不能只写“添加/修改/更新”等泛化词'
    );
  } else {
    sections.push('Language requirement: Output must be in English.');
    sections.push(
      'Output constraints:\n- Return one valid commit subject per line, multiple lines allowed\n- Do not use markdown\n- Do not wrap in quotes\n- Subject must exist after ":"\n- Subject must be specific and not generic words like "update" or "changes"'
    );
  }

  if (snapshot.status.trim()) {
    sections.push(`Git status (short):\n${snapshot.status}`);
  }

  sections.push(`Git diff:\n${snapshot.diff || '(no diff provided)'}`);

  if (snapshot.wasFileLimited) {
    sections.push(
      `Note: Changed files were limited to ${snapshot.includedChangedFiles}/${snapshot.totalChangedFiles} by maxChangedFiles.`
    );
  }

  if (snapshot.wasTruncated) {
    sections.push('Note: Diff content was truncated for performance limits.');
  }

  return {
    systemPrompt: config.systemPrompt,
    userPrompt: sections.join('\n\n')
  };
}

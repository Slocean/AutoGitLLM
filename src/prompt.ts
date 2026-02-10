import { PromptPayload, ChangeSnapshot, ExtensionConfig } from "./types";

export function buildPrompt(snapshot: ChangeSnapshot, config: ExtensionConfig): PromptPayload {
  const sections: string[] = [];

  sections.push("Task: Create one git commit message based on the repository changes.");
  sections.push(`Rules:\n${config.ruleTemplate}`);

  if (config.additionalRules.trim()) {
    sections.push(`Additional rules:\n${config.additionalRules.trim()}`);
  }

  sections.push("Output constraints:\n- Return a single line only\n- Do not use markdown\n- Do not wrap in quotes");

  if (snapshot.status.trim()) {
    sections.push(`Git status (short):\n${snapshot.status}`);
  }

  sections.push(`Git diff:\n${snapshot.diff || "(no diff provided)"}`);

  if (snapshot.wasTruncated) {
    sections.push("Note: Diff content was truncated for performance limits.");
  }

  return {
    systemPrompt: config.systemPrompt,
    userPrompt: sections.join("\n\n")
  };
}

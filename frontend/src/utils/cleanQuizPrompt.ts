const GENERATED_PREFIX = /^\s*(?:\[[^\]]+\s+-\s+Q\d+\]\s*)+/i
const CLASS_TAG_PREFIX = /^\s*(?:\[(?=[^\]]*(?:annee|année|fondamentale|secondaire|\bAF\b|\bNS\d?\b|\bS\d\b))[^\]]+\]\s*)+/i

export function cleanQuizPrompt(prompt: string): string {
  return prompt
    .replace(GENERATED_PREFIX, '')
    .replace(CLASS_TAG_PREFIX, '')
    .trim()
}
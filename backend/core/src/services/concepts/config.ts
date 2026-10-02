export const PROMPT_VERSION = 'concept-classification-v4';
export const POLICY_VERSION = 'evidence-v2';
export const MODEL = () => process.env.CATEGORY_MODEL || 'gpt-4.1-mini';
export type ConceptMode = 'legacy' | 'shadow' | 'concept';
export function conceptMode(): ConceptMode {
  const mode = process.env.CATEGORY_MODE || 'concept';
  if (!['legacy', 'shadow', 'concept'].includes(mode)) throw new Error('Ugyldig CATEGORY_MODE');
  return mode as ConceptMode;
}

import fs from 'fs';
import config from '../../../rest/src/config';

export type MainCategory = string;
export type SubCategory = string;
export type CategoryHierarchy = Record<string, string[]>;
export const DEFAULT_MAIN_CATEGORY = 'Ukategorisert';
export const DEFAULT_SUB_CATEGORY = 'Ukategorisert';

export function validateHierarchy(value: unknown): asserts value is CategoryHierarchy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Kategoristrukturen må være et objekt');
  }
  for (const [main, subs] of Object.entries(value)) {
    if (!main.trim() || ['__proto__', 'constructor', 'prototype'].includes(main) ||
        !Array.isArray(subs) || subs.some(sub => typeof sub !== 'string' || !sub.trim()) ||
        new Set(subs).size !== subs.length) {
      throw new Error('Ugyldig kategori: ' + main);
    }
  }
  const hierarchy = value as CategoryHierarchy;
  if (!hierarchy[DEFAULT_MAIN_CATEGORY]?.includes(DEFAULT_SUB_CATEGORY)) {
    throw new Error('Ukategorisert må beholdes som hoved- og underkategori');
  }
}

const initial: unknown = JSON.parse(fs.readFileSync(config.categoriesFile, 'utf8'));
validateHierarchy(initial);
export const CATEGORY_HIERARCHY: CategoryHierarchy = initial;
export const MAIN_CATEGORIES: string[] = Object.keys(initial);

/** Lagre først; publiser deretter endringen til alle som bruker kategoriene. */
export function saveHierarchy(hierarchy: CategoryHierarchy): void {
  validateHierarchy(hierarchy);
  const next = structuredClone(hierarchy);
  const temporary = config.categoriesFile + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(hierarchy, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, config.categoriesFile);
  for (const key of Object.keys(CATEGORY_HIERARCHY)) delete CATEGORY_HIERARCHY[key];
  Object.assign(CATEGORY_HIERARCHY, next);
  MAIN_CATEGORIES.splice(0, MAIN_CATEGORIES.length, ...Object.keys(next));
}

export function isValidMainCategory(cat: string): cat is MainCategory {
  return Object.prototype.hasOwnProperty.call(CATEGORY_HIERARCHY, cat);
}

export function getSubCategories(mainCat: MainCategory): readonly SubCategory[] {
  return CATEGORY_HIERARCHY[mainCat] || [];
}

export function isValidSubCategory(mainCat: MainCategory, subCat: string): boolean {
  return getSubCategories(mainCat).includes(subCat);
}

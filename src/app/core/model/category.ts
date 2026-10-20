import { isRecord } from './note';

// Barvy kategorií odpovídají tokenům --c-* (sytá) a --t-* (podklad) ve styles.scss
export const CATEGORY_COLORS = [
  { id: 'green', label: 'Zelená' },
  { id: 'blue', label: 'Modrá' },
  { id: 'orange', label: 'Oranžová' },
  { id: 'pink', label: 'Růžová' },
  { id: 'teal', label: 'Tyrkysová' },
  { id: 'violet', label: 'Fialová' },
  { id: 'yellow', label: 'Žlutá' },
  { id: 'red', label: 'Červená' },
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number]['id'];

export interface Category {
  id: string;
  name: string;
  // Klíč ikony ze sady kategorií
  icon: string;
  color: CategoryColor;
  order: number;
  // ISO 8601
  createdAt: string;
  updatedAt: string;
}

export function isCategoryColor(value: unknown): value is CategoryColor {
  return CATEGORY_COLORS.some((color) => color.id === value);
}

export function isCategory(value: unknown): value is Category {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['icon'] === 'string' &&
    isCategoryColor(value['color']) &&
    typeof value['order'] === 'number' &&
    typeof value['createdAt'] === 'string' &&
    typeof value['updatedAt'] === 'string'
  );
}

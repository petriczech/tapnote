import { Category } from '../model/category';

export abstract class CategoriesRepository {
  // Seřazené podle pořadí
  abstract getAll(): Promise<Category[]>;
  abstract put(category: Category): Promise<void>;
  abstract bulkPut(categories: Category[]): Promise<void>;
  abstract delete(id: string): Promise<void>;
  abstract replaceAll(categories: Category[]): Promise<void>;
}

import { Category } from '../../model/category';
import { CategoriesRepository } from '../categories-repository';

// Testovací náhrada DexieCategoriesRepository
export class InMemoryCategoriesRepository extends CategoriesRepository {
  readonly categories = new Map<string, Category>();

  async getAll(): Promise<Category[]> {
    return [...this.categories.values()].sort((a, b) => a.order - b.order);
  }

  async put(category: Category): Promise<void> {
    this.categories.set(category.id, category);
  }

  async bulkPut(categories: Category[]): Promise<void> {
    categories.forEach((category) => this.categories.set(category.id, category));
  }

  async delete(id: string): Promise<void> {
    this.categories.delete(id);
  }

  async replaceAll(categories: Category[]): Promise<void> {
    this.categories.clear();
    await this.bulkPut(categories);
  }
}

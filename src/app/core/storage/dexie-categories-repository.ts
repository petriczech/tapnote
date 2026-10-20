import { inject, Injectable } from '@angular/core';
import { Category } from '../model/category';
import { CategoriesRepository } from './categories-repository';
import { TapnoteDb } from './tapnote-db';

@Injectable()
export class DexieCategoriesRepository extends CategoriesRepository {
  private readonly db = inject(TapnoteDb);

  getAll(): Promise<Category[]> {
    return this.db.categories.orderBy('order').toArray();
  }

  async put(category: Category): Promise<void> {
    await this.db.categories.put(category);
  }

  async bulkPut(categories: Category[]): Promise<void> {
    await this.db.categories.bulkPut(categories);
  }

  delete(id: string): Promise<void> {
    return this.db.categories.delete(id);
  }

  replaceAll(categories: Category[]): Promise<void> {
    return this.db.transaction('rw', this.db.categories, async () => {
      await this.db.categories.clear();
      await this.db.categories.bulkAdd(categories);
    });
  }
}

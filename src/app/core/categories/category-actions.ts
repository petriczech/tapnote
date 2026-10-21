import { inject, Service } from '@angular/core';
import { Category, CategoryColor } from '../model/category';
import { CategoriesRepository } from '../storage/categories-repository';
import { NotesRepository } from '../storage/notes-repository';
import { TasksRepository } from '../storage/tasks-repository';

export type CategoryFields = Pick<Category, 'name' | 'icon'> & { color: CategoryColor };

@Service()
export class CategoryActions {
  private readonly repository = inject(CategoriesRepository);
  private readonly tasks = inject(TasksRepository);
  private readonly notes = inject(NotesRepository);

  // Nová kategorie na konec pořadí
  async add(fields: CategoryFields): Promise<Category> {
    const now = new Date().toISOString();
    const order = Math.max(-1, ...(await this.repository.getAll()).map((item) => item.order)) + 1;
    const category: Category = { id: crypto.randomUUID(), ...fields, name: fields.name.trim(), order, createdAt: now, updatedAt: now };
    await this.repository.put(category);
    return category;
  }

  update(category: Category, fields: CategoryFields): Promise<void> {
    return this.repository.put({ ...category, ...fields, name: fields.name.trim(), updatedAt: new Date().toISOString() });
  }

  // Prohození se sousední kategorií (-1 nahoru, 1 dolů); pořadí se přečísluje, aby posun fungoval
  // i při stejných hodnotách order (třeba ze zálohy)
  async move(category: Category, step: -1 | 1): Promise<void> {
    const all = await this.repository.getAll();
    const index = all.findIndex((item) => item.id === category.id);
    if (index < 0 || !all[index + step]) {
      return;
    }
    [all[index], all[index + step]] = [all[index + step], all[index]];
    const now = new Date().toISOString();
    // Uloží se jen kategorie, kterým se pořadí změnilo
    await this.repository.bulkPut(all.flatMap((item, order) => (item.order === order ? [] : [{ ...item, order, updatedAt: now }])));
  }

  // Úkoly a poznámky v kategorii zůstanou, jen bez kategorie
  async remove(category: Category): Promise<void> {
    const now = new Date().toISOString();
    const tasks = (await this.tasks.getAll()).filter((task) => task.categoryId === category.id);
    const notes = (await this.notes.getAll()).filter((note) => note.categoryId === category.id);
    await Promise.all([
      ...tasks.map((task) => this.tasks.update(task.id, { categoryId: undefined, updatedAt: now })),
      ...notes.map((note) => this.notes.update(note.id, { categoryId: undefined, updatedAt: now })),
    ]);
    await this.repository.delete(category.id);
  }
}

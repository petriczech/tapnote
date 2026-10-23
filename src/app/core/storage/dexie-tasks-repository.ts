import { inject, Injectable } from '@angular/core';
import { Task } from '../model/task';
import { TapnoteDb } from './tapnote-db';
import { TasksRepository } from './tasks-repository';

@Injectable()
export class DexieTasksRepository extends TasksRepository {
  private readonly db = inject(TapnoteDb);

  get(id: string): Promise<Task | undefined> {
    return this.db.tasks.get(id);
  }

  getAll(): Promise<Task[]> {
    return this.db.tasks.toArray();
  }

  async put(task: Task): Promise<void> {
    await this.db.tasks.put(task);
  }

  async bulkPut(tasks: Task[]): Promise<void> {
    await this.db.tasks.bulkPut(tasks);
  }

  async update(id: string, changes: Partial<Omit<Task, 'id'>>): Promise<void> {
    await this.db.tasks.update(id, changes);
  }

  async bulkUpdate(updates: { id: string; changes: Partial<Omit<Task, 'id'>> }[]): Promise<void> {
    await this.db.tasks.bulkUpdate(updates.map(({ id, changes }) => ({ key: id, changes })));
  }

  delete(id: string): Promise<void> {
    return this.db.tasks.delete(id);
  }

  purgeTrash(before: string): Promise<number> {
    return this.db.tasks.where('deletedAt').below(before).delete();
  }

  replaceAll(tasks: Task[]): Promise<void> {
    return this.db.transaction('rw', this.db.tasks, async () => {
      await this.db.tasks.clear();
      await this.db.tasks.bulkAdd(tasks);
    });
  }
}

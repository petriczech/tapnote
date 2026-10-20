import { Task } from '../../model/task';
import { TasksRepository } from '../tasks-repository';

// Testovací náhrada DexieTasksRepository
export class InMemoryTasksRepository extends TasksRepository {
  readonly tasks = new Map<string, Task>();

  async getAll(): Promise<Task[]> {
    return [...this.tasks.values()];
  }

  async put(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async bulkPut(tasks: Task[]): Promise<void> {
    tasks.forEach((task) => this.tasks.set(task.id, task));
  }

  async update(id: string, changes: Partial<Omit<Task, 'id'>>): Promise<void> {
    const task = this.tasks.get(id);
    if (task) {
      const updated: Task = { ...task, ...changes };
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined) {
          Reflect.deleteProperty(updated, key);
        }
      }
      this.tasks.set(id, updated);
    }
  }

  async delete(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async purgeTrash(before: string): Promise<number> {
    const expired = [...this.tasks.values()].filter((task) => task.deletedAt !== undefined && task.deletedAt < before);
    expired.forEach((task) => this.tasks.delete(task.id));
    return expired.length;
  }

  async replaceAll(tasks: Task[]): Promise<void> {
    this.tasks.clear();
    await this.bulkPut(tasks);
  }
}

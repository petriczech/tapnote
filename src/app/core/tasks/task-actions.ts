import { inject, Service } from '@angular/core';
import { createTask, Task } from '../model/task';
import { TRASH_RETENTION_MS } from '../notes/note-actions';
import { TasksRepository } from '../storage/tasks-repository';

export type NewTaskFields = Partial<Pick<Task, 'dueDate' | 'myDay' | 'important' | 'categoryId'>>;

@Service()
export class TaskActions {
  private readonly repository = inject(TasksRepository);

  async add(title: string, fields: NewTaskFields): Promise<Task> {
    const task = { ...createTask(crypto.randomUUID(), title.trim(), new Date().toISOString()), ...fields };
    await this.repository.put(task);
    return task;
  }

  toggleDone(task: Task): Promise<void> {
    return this.change(task, { done: !task.done, completedAt: task.done ? undefined : new Date().toISOString() });
  }

  toggleImportant(task: Task): Promise<void> {
    return this.change(task, { important: !task.important });
  }

  // Úprava v detailu; undefined pole odstraní
  update(task: Task, changes: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    return this.change(task, changes);
  }

  trash(task: Task): Promise<void> {
    return this.change(task, { deletedAt: new Date().toISOString() });
  }

  restore(task: Task): Promise<void> {
    return this.change(task, { deletedAt: undefined });
  }

  deletePermanently(task: Task): Promise<void> {
    return this.repository.delete(task.id);
  }

  purgeTrash(): Promise<number> {
    return this.repository.purgeTrash(new Date(Date.now() - TRASH_RETENTION_MS).toISOString());
  }

  private change(task: Task, changes: Partial<Omit<Task, 'id'>>): Promise<void> {
    return this.repository.update(task.id, { ...changes, updatedAt: new Date().toISOString() });
  }
}

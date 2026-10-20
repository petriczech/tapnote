import { Task } from '../model/task';

export abstract class TasksRepository {
  abstract getAll(): Promise<Task[]>;
  abstract put(task: Task): Promise<void>;
  abstract bulkPut(tasks: Task[]): Promise<void>;
  // Změní se jen uvedená pole, pole s undefined se odstraní
  abstract update(id: string, changes: Partial<Omit<Task, 'id'>>): Promise<void>;
  abstract delete(id: string): Promise<void>;
  // Trvalé smazání úkolů přesunutých do koše před `before`
  abstract purgeTrash(before: string): Promise<number>;
  abstract replaceAll(tasks: Task[]): Promise<void>;
}

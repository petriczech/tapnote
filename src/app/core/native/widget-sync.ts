import { inject, Service } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { liveQuery } from 'dexie';
import { Task } from '../model/task';
import { localDate, queryTasks } from '../model/task-query';
import { TasksRepository } from '../storage/tasks-repository';
import { TaskActions } from '../tasks/task-actions';

// Řádek widgetu „Můj den“
export interface WidgetTask {
  id: string;
  title: string;
  important: boolean;
}

// Odškrtnutí ve widgetu čekající na přenos do aplikace
export interface WidgetToggle {
  id: string;
  done: boolean;
  at: string;
}

// Nativní plugin v android/…/WidgetBridgePlugin.java
interface WidgetBridgePlugin {
  sync(options: { tasks: WidgetTask[]; date: string }): Promise<void>;
  takeToggles(): Promise<{ toggles: WidgetToggle[] }>;
}

export const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');

// Otevřené úkoly Můj den ve stejném pořadí jako v aplikaci
export function widgetTasks(tasks: Task[], today: string): WidgetTask[] {
  return queryTasks(tasks, 'today', today).open.map(({ id, title, important }) => ({ id, title, important }));
}

// Widget nevidí do IndexedDB: aplikace mu zrcadlí snapshot a po spuštění a návratu převezme odškrtnutí z widgetu
@Service()
export class WidgetSync {
  private readonly repository = inject(TasksRepository);
  private readonly actions = inject(TaskActions);

  async start(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    await this.refresh();
    void App.addListener('resume', () => void this.refresh());
    // Každá změna úkolů v Dexie (i z jiného místa aplikace) snapshot obnoví
    liveQuery(() => this.repository.getAll()).subscribe({ next: (tasks) => void this.sync(tasks), error: () => undefined });
  }

  // Po návratu se převezmou odškrtnutí a obnoví se i datum (přes půlnoc se Můj den mění bez změny úkolů)
  async refresh(): Promise<void> {
    await this.applyToggles();
    await this.sync(await this.repository.getAll());
  }

  // Dokončení přes TaskActions, aby completedAt a updatedAt odpovídaly odškrtnutí v aplikaci
  async applyToggles(): Promise<void> {
    const { toggles } = await WidgetBridge.takeToggles();
    for (const toggle of toggles) {
      const task = await this.repository.get(toggle.id);
      if (task && task.done !== toggle.done) {
        await this.actions.toggleDone(task);
      }
    }
  }

  private sync(tasks: Task[]): Promise<void> {
    const date = localDate(new Date());
    return WidgetBridge.sync({ tasks: widgetTasks(tasks, date), date }).catch(() => undefined);
  }
}

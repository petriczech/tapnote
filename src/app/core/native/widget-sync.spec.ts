import { TestBed } from '@angular/core/testing';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { createTask, Task } from '../model/task';
import { localDate } from '../model/task-query';
import { TasksRepository } from '../storage/tasks-repository';
import { InMemoryTasksRepository } from '../storage/testing/in-memory-tasks-repository';
import { WidgetBridge, WidgetSync, widgetTasks } from './widget-sync';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn() },
  registerPlugin: () => ({ sync: vi.fn(), takeToggles: vi.fn() }),
}));

const TODAY = '2026-10-26';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return { ...createTask(id, `Úkol ${id}`, '2026-10-20T10:00:00.000Z'), ...overrides };
}

describe('widgetTasks', () => {
  it('maps open Můj den tasks in app order', () => {
    const tasks = [
      task('a', { myDay: TODAY, order: 2, important: true }),
      task('b', { dueDate: TODAY, order: 1 }),
      task('done', { myDay: TODAY, done: true }),
      task('trash', { myDay: TODAY, deletedAt: '2026-10-25T10:00:00.000Z' }),
      task('other', { myDay: '2026-10-25' }),
    ];

    expect(widgetTasks(tasks, TODAY)).toEqual([
      { id: 'b', title: 'Úkol b', important: false },
      { id: 'a', title: 'Úkol a', important: true },
    ]);
  });
});

describe('WidgetSync', () => {
  let repository: InMemoryTasksRepository;
  let sync: WidgetSync;

  beforeEach(() => {
    repository = new InMemoryTasksRepository();
    TestBed.configureTestingModule({ providers: [{ provide: TasksRepository, useValue: repository }] });
    sync = TestBed.inject(WidgetSync);
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(WidgetBridge.sync).mockResolvedValue();
    vi.mocked(WidgetBridge.takeToggles).mockResolvedValue({ toggles: [] });
  });

  afterEach(() => vi.clearAllMocks());

  it('does nothing in the browser', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    await sync.start();

    expect(WidgetBridge.takeToggles).not.toHaveBeenCalled();
    expect(WidgetBridge.sync).not.toHaveBeenCalled();
    expect(App.addListener).not.toHaveBeenCalled();
  });

  it('completes tasks ticked in the widget like the app does', async () => {
    await repository.put(task('a', { myDay: TODAY }));
    await repository.put(task('b', { done: true, completedAt: '2026-10-21T10:00:00.000Z' }));
    vi.mocked(WidgetBridge.takeToggles).mockResolvedValue({
      toggles: [
        { id: 'a', done: true, at: '2026-10-26T08:00:00.000Z' },
        { id: 'b', done: true, at: '2026-10-26T08:00:00.000Z' },
        { id: 'missing', done: true, at: '2026-10-26T08:00:00.000Z' },
      ],
    });

    await sync.applyToggles();

    const a = await repository.get('a');
    expect(a?.done).toBe(true);
    expect(a?.completedAt).toBeDefined();
    expect((await repository.get('b'))?.completedAt).toBe('2026-10-21T10:00:00.000Z');
  });

  it('syncs the snapshot on start and on resume', async () => {
    const today = localDate(new Date());
    await repository.put(task('a', { myDay: today }));

    await sync.start();
    expect(WidgetBridge.sync).toHaveBeenCalledWith({ tasks: [{ id: 'a', title: 'Úkol a', important: false }], date: today });
    expect(App.addListener).toHaveBeenCalledWith('resume', expect.any(Function));

    await sync.refresh();
    expect(WidgetBridge.takeToggles).toHaveBeenCalledTimes(2);
  });
});

import {
  ApplicationConfig,
  inject,
  Injector,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { NotesRepository } from './core/storage/notes-repository';
import { DexieNotesRepository } from './core/storage/dexie-notes-repository';
import { TasksRepository } from './core/storage/tasks-repository';
import { DexieTasksRepository } from './core/storage/dexie-tasks-repository';
import { CategoriesRepository } from './core/storage/categories-repository';
import { DexieCategoriesRepository } from './core/storage/dexie-categories-repository';
import { VersionsRepository } from './core/storage/versions-repository';
import { DexieVersionsRepository } from './core/storage/dexie-versions-repository';
import { OutboxRepository } from './core/storage/outbox-repository';
import { DexieOutboxRepository } from './core/storage/dexie-outbox-repository';
import { NoteActions } from './core/notes/note-actions';
import { TaskActions } from './core/tasks/task-actions';
import { listenForAppUrls } from './core/native/app-urls';
import { listenForBackButton } from './core/native/back-button';
import { WidgetSync } from './core/native/widget-sync';
import { ParamsRouteReuseStrategy } from './params-route-reuse-strategy';
import { hasSession } from './core/firebase/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: RouteReuseStrategy, useClass: ParamsRouteReuseStrategy },
    { provide: NotesRepository, useClass: DexieNotesRepository },
    { provide: TasksRepository, useClass: DexieTasksRepository },
    { provide: CategoriesRepository, useClass: DexieCategoriesRepository },
    { provide: VersionsRepository, useClass: DexieVersionsRepository },
    { provide: OutboxRepository, useClass: DexieOutboxRepository },
    // Úklid koše na pozadí
    provideAppInitializer(() => void inject(NoteActions).purgeTrash().catch(() => undefined)),
    provideAppInitializer(() => void inject(TaskActions).purgeTrash().catch(() => undefined)),
    // Zkratky a odkazy z Androidu
    provideAppInitializer(listenForAppUrls),
    // Zpět na Androidu zavírá nabídky a dialogy a bez historie vede na seznam
    provideAppInitializer(listenForBackButton),
    // Widget „Můj den“ na Androidu (v prohlížeči nic nedělá)
    provideAppInitializer(() => void inject(WidgetSync).start().catch(() => undefined)),
    // Synchronizace po předchozím přihlášení (web i Android); bez přihlášení se nenačítá nic,
    // po prvním přihlášení ji spustí stránka Synchronizace
    provideAppInitializer(() => {
      if (hasSession()) {
        const injector = inject(Injector);
        void import('./core/firebase/sync.service').then((module) => injector.get(module.SyncService)).catch(() => undefined);
      }
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};

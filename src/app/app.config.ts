import {
  ApplicationConfig,
  inject,
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
import { NoteActions } from './core/notes/note-actions';
import { TaskActions } from './core/tasks/task-actions';
import { listenForAppUrls } from './core/native/app-urls';
import { ParamsRouteReuseStrategy } from './params-route-reuse-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: RouteReuseStrategy, useClass: ParamsRouteReuseStrategy },
    { provide: NotesRepository, useClass: DexieNotesRepository },
    { provide: TasksRepository, useClass: DexieTasksRepository },
    { provide: CategoriesRepository, useClass: DexieCategoriesRepository },
    { provide: VersionsRepository, useClass: DexieVersionsRepository },
    // Úklid koše na pozadí
    provideAppInitializer(() => void inject(NoteActions).purgeTrash().catch(() => undefined)),
    provideAppInitializer(() => void inject(TaskActions).purgeTrash().catch(() => undefined)),
    // Zkratky a odkazy z Androidu
    provideAppInitializer(listenForAppUrls),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};

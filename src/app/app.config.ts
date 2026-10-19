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
import { NoteActions } from './core/notes/note-actions';
import { ParamsRouteReuseStrategy } from './params-route-reuse-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: RouteReuseStrategy, useClass: ParamsRouteReuseStrategy },
    { provide: NotesRepository, useClass: DexieNotesRepository },
    // Úklid koše na pozadí
    provideAppInitializer(() => void inject(NoteActions).purgeTrash().catch(() => undefined)),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};

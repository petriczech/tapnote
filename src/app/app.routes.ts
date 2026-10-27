import { Routes } from '@angular/router';
import { openToday } from './core/notes/daily-note';
import { NoteEditor } from './features/editor/note-editor';
import { Split } from './features/list/split';

export const routes: Routes = [
  // Po spuštění se otevírají úkoly; obnovení naposledy upravené poznámky (data.resume) zůstává připravené níže
  { path: '', pathMatch: 'full', redirectTo: 'tasks' },
  // Rodič bez segmentu: od 1200 px vedle editoru seznam poznámek, URL beze změny
  {
    path: '',
    component: Split,
    children: [
      { path: '', component: NoteEditor, data: { resume: true } },
      { path: 'new', component: NoteEditor },
      { path: 'note/:id', component: NoteEditor },
    ],
  },
  // Totéž pro úkoly: od 1200 px seznam úkolů vedle detailu, /tasks samotná zůstává jeden panel
  {
    path: '',
    component: Split,
    data: { list: 'tasks' },
    children: [{ path: 'task/:id', loadComponent: () => import('./features/tasks/task-detail').then((m) => m.TaskDetail) }],
  },
  { path: 'today', children: [], canActivate: [openToday] },
  { path: 'note/:id/history', loadComponent: () => import('./features/editor/note-history').then((m) => m.NoteHistory) },
  { path: 'tasks', loadComponent: () => import('./features/tasks/tasks-page').then((m) => m.TasksPage) },
  { path: 'notes', loadComponent: () => import('./features/list/notes-list').then((m) => m.NotesList) },
  { path: 'settings', loadComponent: () => import('./features/settings/settings').then((m) => m.Settings) },
  { path: 'settings/vzhled', loadComponent: () => import('./features/settings/appearance').then((m) => m.Appearance) },
  { path: 'settings/kategorie', loadComponent: () => import('./features/settings/categories').then((m) => m.Categories) },
  { path: 'settings/synchronizace', loadComponent: () => import('./features/settings/sync').then((m) => m.Sync) },
  { path: 'settings/zkratky', loadComponent: () => import('./features/settings/shortcuts').then((m) => m.Shortcuts) },
  // Přesměrování se neřetězí, proto přímo na úkoly, ne přes ''
  { path: '**', redirectTo: 'tasks' },
];

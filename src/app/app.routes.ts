import { Routes } from '@angular/router';
import { NoteEditor } from './features/editor/note-editor';

export const routes: Routes = [
  { path: '', component: NoteEditor, data: { resume: true } },
  { path: 'new', component: NoteEditor },
  { path: 'note/:id', component: NoteEditor },
  { path: 'note/:id/history', loadComponent: () => import('./features/editor/note-history').then((m) => m.NoteHistory) },
  { path: 'tasks', loadComponent: () => import('./features/tasks/tasks-page').then((m) => m.TasksPage) },
  { path: 'task/:id', loadComponent: () => import('./features/tasks/task-detail').then((m) => m.TaskDetail) },
  { path: 'notes', loadComponent: () => import('./features/list/notes-list').then((m) => m.NotesList) },
  { path: 'settings', loadComponent: () => import('./features/settings/settings').then((m) => m.Settings) },
  { path: '**', redirectTo: '' },
];

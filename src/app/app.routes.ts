import { Routes } from '@angular/router';
import { NoteEditor } from './features/editor/note-editor';

export const routes: Routes = [
  { path: '', component: NoteEditor, data: { resume: true } },
  { path: 'new', component: NoteEditor },
  { path: 'note/:id', component: NoteEditor },
  { path: 'notes', loadComponent: () => import('./features/list/notes-list').then((m) => m.NotesList) },
  { path: '**', redirectTo: '' },
];

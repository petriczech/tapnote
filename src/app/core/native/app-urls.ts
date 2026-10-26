import { Location } from '@angular/common';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// Zkratky „Nová poznámka“ a „Nový úkol“ z Androidu (res/xml/shortcuts.xml)
export const NEW_NOTE_URL = 'tapnote://new';
export const NEW_TASK_URL = 'tapnote://new-task';
// Záhlaví a detail úkolu z widgetu „Můj den“
export const TASKS_URL = 'tapnote://tasks';
export const TASK_URL_PREFIX = 'tapnote://task/';

function taskPath(url: string | undefined): string | undefined {
  const id = url?.startsWith(TASK_URL_PREFIX) ? url.slice(TASK_URL_PREFIX.length) : '';
  return id ? `/task/${encodeURIComponent(id)}` : undefined;
}

// Start ze zkratky přepíše adresu před první navigací (statická zkratka spouští úlohu vždy znovu);
// posluchač pokrývá odkazy do běžící aplikace
export async function listenForAppUrls(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }
  const router = inject(Router);
  const location = inject(Location);
  void App.addListener('appUrlOpen', (event) => {
    if (event.url === NEW_NOTE_URL) {
      void router.navigateByUrl('/new');
    } else if (event.url === NEW_TASK_URL) {
      void router.navigateByUrl('/tasks?new=1');
    } else if (event.url === TASKS_URL) {
      void router.navigateByUrl('/tasks');
    } else if (taskPath(event.url)) {
      void router.navigateByUrl(taskPath(event.url) ?? '/tasks');
    }
  });
  const launch = await App.getLaunchUrl().catch(() => undefined);
  if (launch?.url === NEW_NOTE_URL) {
    location.replaceState('/new');
  } else if (launch?.url === NEW_TASK_URL) {
    location.replaceState('/tasks', 'new=1');
  } else if (taskPath(launch?.url)) {
    location.replaceState(taskPath(launch?.url) ?? '/tasks');
  }
}

import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// Nadřazený seznam podstránky; úkoly jsou výchozí obrazovka, z ní se aplikace jen skryje
function parentPath(path: string): string | undefined {
  if (path === '/tasks') {
    return undefined;
  }
  if (path.startsWith('/settings/')) {
    return '/settings';
  }
  if (path === '/new' || path.startsWith('/note/')) {
    return '/notes';
  }
  return '/tasks';
}

// Zpět na Androidu (tlačítko i gesto): posluchač vypíná výchozí chování Capacitoru, proto se řeší všechny případy.
// Nejdřív se zavře nabídka nebo dialog jako po Esc, pak se jde zpět v historii; bez historie (start z widgetu
// přes replaceState) se z podstránky přejde na její seznam a z úkolů se aplikace skryje jako na Androidu 12+
export function listenForBackButton(): void {
  if (!Capacitor.isNativePlatform()) {
    return;
  }
  const router = inject(Router);
  void App.addListener('backButton', ({ canGoBack }) => {
    const menu = 'popover' in HTMLElement.prototype ? [...document.querySelectorAll<HTMLElement>(':popover-open')].at(-1) : undefined;
    const dialog = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1);
    const parent = parentPath(router.url.split(/[?#]/)[0]);
    if (menu) {
      menu.hidePopover();
    } else if (dialog) {
      // Stejné zavření jako v komponentě; událost close srovná stav dialogu
      dialog.close();
    } else if (canGoBack) {
      history.back();
    } else if (parent) {
      void router.navigateByUrl(parent, { replaceUrl: true });
    } else {
      void App.minimizeApp();
    }
  });
}

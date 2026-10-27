import { afterNextRender, Component, computed, ElementRef, inject, Injector, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthError, AuthService } from '../../core/firebase/auth.service';
import { SyncService, SyncState } from '../../core/firebase/sync.service';
import { ICONS_REGULAR } from '../../core/icons/icons';
import { BottomNav } from '../list/bottom-nav';

const ERRORS: Record<AuthError, string> = {
  cancelled: 'Přihlášení se zrušilo.',
  blocked: 'Prohlížeč zablokoval okno přihlášení. Povolte vyskakovací okna a zkuste to znovu.',
  offline: 'Přihlášení vyžaduje připojení k internetu.',
  failed: 'Přihlášení se nepovedlo. Zkuste to znovu.',
};

const STATES: Partial<Record<SyncState, string>> = {
  idle: 'Synchronizováno',
  syncing: 'Synchronizuje se…',
  offline: 'Offline. Změny se odešlou po připojení.',
  error: 'Synchronizace selhala. Zkusí se to znovu.',
};

const CLOUD_DELETE_QUESTION =
  'Smazat data v cloudu? Smažou se poznámky, úkoly a kategorie uložené v cloudu. Data v tomto zařízení zůstanou a účet se odhlásí.';

// Podstránka Nastavení › Synchronizace: přihlášení přes Google (S3), zamítnutý přístup (S6), stav a ovládání syncu (S7)
@Component({
  selector: 'tn-sync',
  imports: [BottomNav, RouterLink],
  template: `
    <tn-bottom-nav current="settings" />

    <header id="obsah" class="app-bar" tabindex="-1">
      <a class="crumbs" routerLink="/settings">
        Nastavení
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.caretRight" /></svg>
      </a>
      <h1 tabindex="-1">Synchronizace</h1>
    </header>

    <div class="card">
      @if (auth.state() === 'signedIn') {
        <p class="info">Přihlášeno jako {{ auth.email() }}</p>
        <!-- Stav synchronizace leží mimo živou oblast: při psaní se syncing a idle střídají každých pár sekund
             a čtečka by je hlásila pořád dokola; hlásí se jen výsledky akcí a chyby v .status -->
        @if (stateText(); as text) {
          <p class="state" [class.error]="sync.state() === 'error'">{{ text }}</p>
        }
        @if (sync.rejected() > 0) {
          <p class="state error">Server odmítl některé záznamy ({{ sync.rejected() }}).</p>
        }
        @if (lastSyncText(); as text) {
          <p class="info">Poslední synchronizace: {{ text }}</p>
        }
        @if (sync.pending() > 0) {
          <p class="info">Čeká na odeslání: {{ sync.pending() }}</p>
        }
      } @else {
        <p class="info">
          Po přihlášení se poznámky, úkoly a kategorie synchronizují mezi zařízeními. Bez přihlášení vše zůstává jen v tomto
          zařízení.
        </p>
      }
      <!-- Jedno tlačítko pro oba stavy, aby fokus po přihlášení i odhlášení zůstal na místě -->
      <div class="actions">
        <button
          type="button"
          [class.outlined]="auth.state() === 'signedIn'"
          [class.filled]="auth.state() !== 'signedIn'"
          [attr.aria-disabled]="busy()"
          (click)="toggle()"
        >
          {{ auth.state() === 'signedIn' ? 'Odhlásit' : 'Přihlásit přes Google' }}
        </button>
        <!-- Po zamítnutí přístupu a mimo běžící synchronizaci (off) se tlačítka nenabízejí -->
        @if (auth.state() === 'signedIn' && sync.state() !== 'denied' && sync.state() !== 'off') {
          <button type="button" class="outlined" [attr.aria-disabled]="busy() || sync.state() === 'syncing'" (click)="syncNow()">
            Synchronizovat teď
          </button>
          <button type="button" class="outlined" [attr.aria-disabled]="busy()" (click)="deleteCloud()">Smazat data v cloudu</button>
        }
      </div>
    </div>

    <p class="status" [class.error]="failed()" aria-live="polite">{{ status() }}</p>
  `,
  styleUrl: './sync.scss',
})
export class Sync {
  protected readonly auth = inject(AuthService);
  // Po přihlášení na této stránce spustí synchronizaci i bez předchozí relace
  protected readonly sync = inject(SyncService);
  protected readonly icons = ICONS_REGULAR;
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly working = signal(false);
  private readonly message = signal('');
  private readonly error = signal<AuthError | null>(null);
  // Smazání dat v cloudu selhalo (obecná chybová hláška synchronizace)
  private readonly cloudFailed = signal(false);

  protected readonly busy = computed(() => this.working() || this.auth.state() === 'loading');
  private readonly denied = computed(() => this.auth.state() === 'signedIn' && this.sync.state() === 'denied');
  protected readonly failed = computed(() => (this.error() ?? this.auth.redirectError()) !== null || this.denied() || this.cloudFailed());
  protected readonly status = computed(() => {
    const error = this.error() ?? this.auth.redirectError();
    if (error) {
      return ERRORS[error];
    }
    if (this.denied()) {
      return 'Tento účet nemá k synchronizaci přístup.';
    }
    return this.cloudFailed() ? STATES.error : this.message();
  });
  protected readonly stateText = computed(() => STATES[this.sync.state()]);
  // Stejný formát jako „Poslední záloha“ v Nastavení
  protected readonly lastSyncText = computed(() => {
    const iso = this.sync.lastSyncedAt();
    return iso ? new Date(iso).toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  });

  constructor() {
    void this.auth.start().catch(() => undefined);
    // Po přechodu z rozcestníku se fokus přesune na nadpis podstránky
    afterNextRender(() => this.host.querySelector<HTMLElement>('h1')?.focus());
  }

  protected async toggle(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.working.set(true);
    this.message.set('');
    this.error.set(null);
    this.cloudFailed.set(false);
    this.auth.redirectError.set(null);
    try {
      if (this.auth.state() === 'signedIn') {
        await this.auth.signOut();
        this.message.set('Odhlášeno. Data v tomto zařízení zůstávají.');
      } else {
        this.error.set(await this.auth.signIn());
      }
    } catch {
      this.error.set('failed');
    } finally {
      this.working.set(false);
    }
  }

  protected syncNow(): void {
    if (this.busy() || this.sync.state() === 'syncing') {
      return;
    }
    this.cloudFailed.set(false);
    this.sync.syncNow();
  }

  protected async deleteCloud(): Promise<void> {
    if (this.busy() || !confirm(CLOUD_DELETE_QUESTION)) {
      return;
    }
    this.working.set(true);
    this.message.set('');
    this.error.set(null);
    this.cloudFailed.set(false);
    try {
      await this.sync.deleteCloud();
      this.message.set('Data v cloudu jsou smazaná.');
      // Tlačítko zmizí s odhlášením, fokus přejde na tlačítko přihlášení na stejném místě karty
      afterNextRender(() => this.host.querySelector<HTMLElement>('.card button')?.focus(), { injector: this.injector });
    } catch {
      this.cloudFailed.set(true);
    } finally {
      this.working.set(false);
    }
  }
}

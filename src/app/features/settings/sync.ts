import { afterNextRender, Component, computed, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { AuthError, AuthService } from '../../core/firebase/auth.service';
import { ICONS_REGULAR } from '../../core/icons/icons';
import { BottomNav } from '../list/bottom-nav';

const ERRORS: Record<AuthError, string> = {
  cancelled: 'Přihlášení se zrušilo.',
  blocked: 'Prohlížeč zablokoval okno přihlášení. Povolte vyskakovací okna a zkuste to znovu.',
  offline: 'Přihlášení vyžaduje připojení k internetu.',
  failed: 'Přihlášení se nepovedlo. Zkuste to znovu.',
};

// Podstránka Nastavení › Synchronizace: přihlášení přes Google (S3); stav syncu přibude v S7
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
      } @else {
        <p class="info">
          Po přihlášení se poznámky, úkoly a kategorie synchronizují mezi zařízeními. Bez přihlášení vše zůstává jen v tomto
          zařízení.
        </p>
      }
      <!-- Jedno tlačítko pro oba stavy, aby fokus po přihlášení i odhlášení zůstal na místě; v Android aplikaci
           se přihlášení nenabízí až do nativního přihlášení (S4) -->
      @if (!native) {
        <button
          type="button"
          [class.outlined]="auth.state() === 'signedIn'"
          [class.filled]="auth.state() !== 'signedIn'"
          [attr.aria-disabled]="busy()"
          (click)="toggle()"
        >
          {{ auth.state() === 'signedIn' ? 'Odhlásit' : 'Přihlásit přes Google' }}
        </button>
      }
    </div>

    <p class="status" [class.error]="failed()" aria-live="polite">{{ status() }}</p>
  `,
  styleUrl: './sync.scss',
})
export class Sync {
  protected readonly auth = inject(AuthService);
  protected readonly icons = ICONS_REGULAR;
  protected readonly native = Capacitor.isNativePlatform();
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly working = signal(false);
  private readonly message = signal('');
  private readonly error = signal<AuthError | null>(null);

  protected readonly busy = computed(() => this.working() || this.auth.state() === 'loading');
  protected readonly failed = computed(() => (this.error() ?? this.auth.redirectError()) !== null);
  protected readonly status = computed(() => {
    const error = this.error() ?? this.auth.redirectError();
    return error ? ERRORS[error] : this.message();
  });

  constructor() {
    if (!this.native) {
      void this.auth.start().catch(() => undefined);
    }
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
}

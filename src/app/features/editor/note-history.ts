import { afterNextRender, Component, ElementRef, inject, Injector, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ICONS_REGULAR } from '../../core/icons/icons';
import { Note } from '../../core/model/note';
import { NoteVersion } from '../../core/model/note-version';
import { NoteActions } from '../../core/notes/note-actions';
import { NotesRepository } from '../../core/storage/notes-repository';
import { VersionsRepository } from '../../core/storage/versions-repository';

@Component({
  selector: 'tn-note-history',
  imports: [RouterLink],
  template: `
    <div class="toolbar">
      <a class="icon-btn" [routerLink]="['/note', id()]" title="Poznámka">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.back" /></svg>
        <span class="visually-hidden">Poznámka</span>
      </a>
    </div>
    <h1 tabindex="-1">Historie verzí</h1>
    @if (note(); as note) {
      <p class="info">{{ note.title || 'Bez názvu' }}</p>
    }

    @if (loaded() && !failed() && versions().length === 0) {
      <p class="info">Zatím žádné starší verze. Verze se uloží, když se poznámka upravuje po pauze v psaní.</p>
    }
    <ul class="versions">
      @for (version of versions(); track version.id) {
        <li>
          <div class="head">
            <span class="time">{{ timeOf(version) }}</span>
            <button type="button" class="text-btn" [attr.aria-label]="'Obnovit verzi z ' + timeOf(version)" (click)="restore(version)">
              Obnovit
            </button>
          </div>
          <details>
            <summary>{{ snippetOf(version) }}</summary>
            <p class="content">{{ version.content }}</p>
          </details>
        </li>
      }
    </ul>
    <p class="status" [class.error]="failed()" aria-live="polite">{{ status() }}</p>
  `,
  styles: `
    :host {
      display: block;
      max-width: 720px;
      margin: 0 auto;
      padding: env(safe-area-inset-top) 0 calc(2rem + env(safe-area-inset-bottom));
    }

    .toolbar {
      display: flex;
      align-items: center;
      min-height: 56px;
      padding: 0 4px;
    }

    h1 {
      margin: 0 16px;
      font-family: var(--title-font);
      font-size: var(--title-size);
      font-weight: var(--title-weight);
      letter-spacing: var(--title-spacing);
    }

    h1:focus:not(:focus-visible) {
      outline: none;
    }

    .info {
      margin: 4px 16px 12px;
      color: var(--on-surface-variant);
    }

    .versions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0 16px;
      list-style: none;
    }

    li {
      padding: 8px 8px 8px 16px;
      border: 1px solid var(--card-border);
      border-radius: var(--card-radius);
      background: var(--card-bg);
      box-shadow: var(--card-shadow);
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .time {
      font-weight: 700;
    }

    .text-btn {
      min-height: 44px;
      padding: 0 12px;
      border: 0;
      border-radius: var(--radius-l);
      background: none;
      color: var(--primary);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    summary {
      min-height: 32px;
      padding: 4px 0;
      color: var(--on-surface-variant);
      cursor: pointer;
      overflow-wrap: anywhere;
    }

    .content {
      margin: 8px 0 4px;
      font-family: var(--editor-font);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .status {
      margin: 12px 16px 0;
    }

    .status.error {
      color: var(--error);
    }
  `,
})
export class NoteHistory implements OnInit {
  readonly id = input.required<string>();

  private readonly notes = inject(NotesRepository);
  private readonly versionsRepository = inject(VersionsRepository);
  private readonly actions = inject(NoteActions);
  private readonly router = inject(Router);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly icons = ICONS_REGULAR;
  protected readonly note = signal<Note | undefined>(undefined);
  protected readonly versions = signal<NoteVersion[]>([]);
  protected readonly loaded = signal(false);
  protected readonly status = signal('');
  protected readonly failed = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const note = await this.notes.get(this.id());
      if (!note || note.deletedAt) {
        await this.router.navigate(['/notes'], { replaceUrl: true });
        return;
      }
      this.note.set(note);
      this.versions.set(await this.versionsRepository.getForNote(note.id));
    } catch {
      this.failed.set(true);
      this.status.set('Historii se nepodařilo načíst.');
    }
    this.loaded.set(true);
    afterNextRender(() => this.host.querySelector<HTMLElement>('h1')?.focus(), { injector: this.injector });
  }

  protected timeOf(version: NoteVersion): string {
    return new Date(version.createdAt).toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' });
  }

  // První neprázdný řádek jako náhled
  protected snippetOf(version: NoteVersion): string {
    return version.content.split('\n').find((line) => line.trim() !== '')?.trim() || 'Bez textu';
  }

  protected async restore(version: NoteVersion): Promise<void> {
    const note = this.note();
    if (!note) {
      return;
    }
    try {
      await this.actions.restoreVersion(note, version);
      await this.router.navigate(['/note', note.id]);
    } catch {
      this.failed.set(true);
      this.status.set('Verzi se nepodařilo obnovit.');
    }
  }
}

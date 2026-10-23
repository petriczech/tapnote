import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TasksPage } from '../tasks/tasks-page';
import { NotesList } from './notes-list';

// Od 1200 px seznam poznámek vlevo vedle editoru, s data.list 'tasks' seznam úkolů vedle detailu úkolu;
// URL se nemění, editor i detail zůstávají v témže outletu
@Component({
  selector: 'tn-split',
  imports: [RouterOutlet, NotesList, TasksPage],
  host: { '[class.tasks]': 'tasks()' },
  template: `
    @if (wide()) {
      <section id="obsah" class="list" tabindex="-1" [attr.aria-label]="tasks() ? 'Úkoly' : 'Poznámky'">
        <!-- Seznam se načte až v širokém okně, úvodní balík zůstane bez něj -->
        @if (tasks()) {
          @defer (on immediate) {
            <tn-tasks-page pane [saves]="saves()" [openId]="openId()" [view]="view()" [category]="category()" />
          }
        } @else {
          @defer (on immediate) {
            <tn-notes-list pane [saves]="saves()" [openId]="openId()" [view]="view()" [tag]="tag()" [category]="category()" [q]="q()" />
          }
        }
      </section>
    }
    <div class="detail"><router-outlet /></div>
  `,
  styles: `
    // Pod 1200 px bez vlastního boxu, editor je přes celou šířku jako dřív
    :host,
    .detail {
      display: contents;
    }

    @media (min-width: 1200px) {
      :host {
        display: grid;
        grid-template-columns: 340px minmax(0, 1fr);
        height: 100dvh;
      }

      // Úkoly: seznam pružně vlevo, detail úkolu vpravo
      :host(.tasks) {
        grid-template-columns: minmax(0, 1fr) 452px;
      }

      // Seznam se posouvá sám, posun zůstává při přepínání poznámek
      .list {
        overflow-y: auto;
        overscroll-behavior: contain;
        border-right: 1px solid var(--outline-variant);
      }

      .list:focus:not(:focus-visible) {
        outline: none;
      }

      .list:focus-visible {
        outline-offset: -2px;
      }

      // Pevný panel nástrojů a hlášky editoru se kotví ke sloupci editoru
      .detail {
        display: block;
        min-width: 0;
        contain: layout;
      }
    }
  `,
})
export class Split {
  // Seznam vedle detailu z data.list routy ('tasks' pro úkoly, jinak poznámky)
  readonly list = input<string>();
  protected readonly tasks = computed(() => this.list() === 'tasks');
  // Pohled, tag, kategorie a hledání seznamu z query parametrů jako na /notes
  readonly view = input<string>();
  readonly tag = input<string>();
  readonly category = input<string>();
  readonly q = input<string>();

  private readonly query = matchMedia('(min-width: 1200px)');
  readonly wide = signal(this.query.matches);
  // Počet uložení v editoru nebo detailu, seznam se po každém načte znovu; id poznámky nebo úkolu v nich otevřeného
  readonly saves = signal(0);
  readonly openId = signal<string | undefined>(undefined);

  constructor() {
    const update = (event: MediaQueryListEvent) => this.wide.set(event.matches);
    this.query.addEventListener('change', update);
    inject(DestroyRef).onDestroy(() => this.query.removeEventListener('change', update));
  }
}

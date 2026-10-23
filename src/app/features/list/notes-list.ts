import {
  afterNextRender,
  booleanAttribute,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  OnInit,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Location, NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { daysWithoutBackup, readLastBackup } from '../../core/backup/notes-backup';
import { parseSegments } from '../../core/model/checklist';
import { Note } from '../../core/model/note';
import { collectTags, isNotesView, queryNotes, snippet, templatesOf } from '../../core/model/note-query';
import { NoteActions } from '../../core/notes/note-actions';
import { createNoteSearch, normalizeTerm, parseQuery } from '../../core/search/note-search';
import { NOTE_COLORS, NoteColor, noteColorVar } from '../../core/model/note-colors';
import { Category } from '../../core/model/category';
import { categoryIconPath } from '../../core/model/category-icons';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { isPlainKey, readShortcutsEnabled } from '../../core/shortcuts/shortcuts';
import { NotesRepository } from '../../core/storage/notes-repository';
import { Task } from '../../core/model/task';
import { addDays, localDate } from '../../core/model/task-query';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { TaskActions } from '../../core/tasks/task-actions';
import { BottomNav } from './bottom-nav';
import { VIEWS } from './views';
import { ICONS, ICONS_FILL, ICONS_REGULAR } from '../../core/icons/icons';

export const URL_DEBOUNCE_MS = 300;

type NoteAction = 'pin' | 'archive' | 'unarchive' | 'template' | 'color' | 'category' | 'trash' | 'restore' | 'delete';

// Rozložení seznamu v zařízení: 'grid' nebo 'list'
export const LAYOUT_KEY = 'tapnote.layout';

function readLayout(): string | null {
  try {
    return localStorage.getItem(LAYOUT_KEY);
  } catch {
    return null;
  }
}

// Datum úpravy na kartě: dnes, včera, jinak „12. 10.“ (s rokem mimo letošek)
function dateLabel(iso: string, today: string): string {
  const date = localDate(new Date(iso));
  if (date === today) {
    return 'dnes';
  }
  if (date === addDays(today, -1)) {
    return 'včera';
  }
  const [year, month, day] = date.split('-').map(Number);
  return `${day}. ${month}.${year === Number(today.slice(0, 4)) ? '' : ` ${year}`}`;
}

@Component({
  selector: 'tn-notes-list',
  host: {
    '[class.with-templates]': 'templates().length > 0 && !pane()',
    // Mřížka má na desktopu širší obsah (styles.scss)
    '[class.grid]': 'grid() && !pane()',
    '[class.pane]': 'pane()',
    '(document:keydown)': 'onKey($event)',
    '(document:visibilitychange)': 'refreshToday()',
  },
  imports: [NgOptimizedImage, NgTemplateOutlet, RouterLink, BottomNav],
  template: `
    <tn-bottom-nav [current]="current().view" [q]="queryParam()" (leave)="flushQuery()" />

    <!-- Vedle editoru (pane) bez nadpisu a filtrů, zůstává hledání a kompaktní řádky; panel tn-bottom-nav je na stránce jen tady -->
    <header class="header">
      @if (!pane()) {
        <div class="app-bar">
          <div class="heading">
            <p class="eyebrow">{{ countLine() }}</p>
            <h1 #heading id="obsah" tabindex="-1">
              <img class="app-logo" ngSrc="icons/icon-96x96.png" width="32" height="32" alt="" />
              @if (current().view === 'notes') {
                <span class="app-name">Tapnote<span class="visually-hidden"> – </span></span>
                <span class="view-name visually-hidden">{{ current().label }}</span>
              } @else {
                {{ current().label }}
              }
            </h1>
          </div>
          <a class="icon-btn" routerLink="/today" title="Dnešní poznámka" (click)="flushQuery()">
            <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconsRegular.calendar" /></svg>
            <span class="visually-hidden">Dnešní poznámka</span>
          </a>
          <button
            type="button"
            class="icon-btn"
            title="Mřížka"
            [class.on]="grid()"
            [attr.aria-pressed]="grid()"
            (click)="toggleGrid()"
          >
            <svg class="icon" viewBox="0 0 256 256" aria-hidden="true">
              <path [attr.d]="iconsRegular.grid" />
            </svg>
            <span class="visually-hidden">Mřížka</span>
          </button>
        </div>
      }
      <div role="search" class="search">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true">
          <path [attr.d]="icons.search" />
        </svg>
        <input
          #field
          type="search"
          aria-label="Hledat"
          placeholder="Hledat"
          [value]="query()"
          (input)="onQuery(field.value)"
          (keydown.escape)="onQuery(''); pane() && $event.preventDefault()"
        />
        @if (shortcuts) {
          <kbd class="key-hint" aria-hidden="true">/</kbd>
          <kbd aria-hidden="true">Ctrl F</kbd>
        }
      </div>
      @if (!pane() && categories().length > 0) {
        <nav class="chips categories" aria-label="Kategorie">
          @for (item of categories(); track item.id) {
            <a
              routerLink="/notes"
              queryParamsHandling="merge"
              [queryParams]="{ category: item.id === category() ? null : item.id }"
              [style.--cat]="catVar(item)"
              [attr.aria-current]="item.id === category() ? 'true' : null"
            >
              <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconPath(item.icon)" /></svg>
              {{ item.name }}
            </a>
          }
        </nav>
      }
      @if (!pane() && tags().length > 0) {
        <nav class="chips" aria-label="Tagy">
          @for (name of tags(); track name) {
            <a
              routerLink="/notes"
              [queryParams]="{ view: viewParam(), tag: name === tag() ? null : name, q: queryParam(), category: category() ?? null }"
              [attr.aria-current]="name === tag() ? 'true' : null"
              >#{{ name }}</a
            >
          }
        </nav>
      }
    </header>

    @if (backupDays(); as days) {
      <p class="backup">
        Bez zálohy {{ days }} dní
        <a routerLink="/settings" fragment="backup" (click)="flushQuery()">Zálohovat</a>
      </p>
    }

    <p class="visually-hidden" aria-live="polite">{{ found() }}</p>

    @if (current().view === 'trash') {
      <p class="hint">Poznámky v koši se po 30 dnech smažou.</p>
    }

    @if (actionFailed()) {
      <p class="error" role="alert">Akci se nepodařilo dokončit.</p>
    }

    <!-- Náhled karty: řádky checklistu (čtverečky jen jako dekorace) nebo text, kategorie a patička -->
    <ng-template #preview let-item>
      @if (item.rows.length > 0) {
        <span class="rows">
          @for (row of item.rows.slice(0, 4); track $index) {
            <span [class.ok]="row.checked"><span class="box" aria-hidden="true"></span>{{ row.text }}</span>
          }
        </span>
      } @else if (item.snippet) {
        <span class="snippet">{{ item.snippet }}</span>
      }
      @if (categoryOf(item.note); as cat) {
        <span class="note-cat" [style.--cat]="catVar(cat)">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconPath(cat.icon)" /></svg>
          {{ cat.name }}
        </span>
      }
      <span class="foot">
        <span class="note-tags">
          @if (item.rows.length > 0) {
            <span><span class="visually-hidden">hotovo </span>{{ item.done }}/{{ item.rows.length }}</span>
          }
          @for (name of item.note.tags; track name) {
            <span>#{{ name }}</span>
          }
        </span>
        <time [attr.datetime]="item.note.updatedAt">{{ item.date }}</time>
      </span>
    </ng-template>

    @if (loadFailed() || (loaded() && items().length === 0 && trashedTasks().length === 0)) {
      <div class="empty-state">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons[current().icon]" /></svg>
        @if (loadFailed()) {
          <p class="empty" role="alert">Poznámky se nepodařilo načíst.</p>
        } @else {
          <p class="empty">{{ queryParam() ? 'Nic nenalezeno pro „' + query().trim() + '“' : tag() ? 'Žádné poznámky s tagem #' + tag() : activeCategory() ? 'Žádné poznámky v kategorii ' + activeCategory()!.name : current().empty }}</p>
        }
      </div>
    } @else {
      @for (group of items().length > 0 ? groups() : []; track group.label) {
        @if (group.label) {
          <div class="label">
            <h2>{{ group.label }}</h2>
            <span aria-hidden="true">{{ group.items.length }}</span>
          </div>
        }
        <ul class="notes" [class.grid]="grid() && !pane()">
          @for (item of group.items; track item.note.id) {
            <li
              [attr.data-id]="item.note.id"
              [class.pinned]="item.note.pinned && current().view !== 'trash'"
              [class.colored]="colorVar(item.note.color) !== null"
              [style.--note-bg]="colorVar(item.note.color)"
              [style.--note-edge]="'var(--note-edge-' + item.note.color + ')'"
            >
              @if (current().view === 'trash') {
                <div class="body">
                  <span class="title">{{ item.title }}</span>
                  <ng-container [ngTemplateOutlet]="preview" [ngTemplateOutletContext]="{ $implicit: item }" />
                </div>
              } @else {
                <a
                  class="body"
                  [routerLink]="['/note', item.note.id]"
                  queryParamsHandling="preserve"
                  [attr.aria-current]="item.note.id === openId() ? 'page' : null"
                  (click)="flushQuery()"
                >
                  <span class="title">
                    @if (item.note.pinned) {
                      <span class="visually-hidden">Připnuto: </span>
                    }
                    {{ item.title }}
                    @if (item.note.pinned) {
                      <svg class="icon pin" viewBox="0 0 256 256" aria-hidden="true">
                        <path [attr.d]="iconsFill.pin" />
                      </svg>
                    }
                  </span>
                  <ng-container [ngTemplateOutlet]="preview" [ngTemplateOutletContext]="{ $implicit: item }" />
                </a>
              }
              <!-- Akce otevřené poznámky jsou v editoru vedle (jeho další uložení by je přepsalo) -->
              @if (item.note.id !== openId()) {
                <button
                  type="button"
                  class="icon-btn actions"
                  [attr.popovertarget]="'menu-' + item.note.id"
                  [attr.aria-label]="'Akce pro ' + item.title"
                >
                  <svg class="icon" viewBox="0 0 256 256" aria-hidden="true">
                    <path [attr.d]="icons.more" />
                  </svg>
                </button>
                <div #menu class="menu" popover [id]="'menu-' + item.note.id" (toggle)="onMenuToggle($event)">
                  @if (current().view === 'trash') {
                    <button type="button" (click)="run(item.note, 'restore', menu)">Obnovit</button>
                    <button type="button" (click)="run(item.note, 'delete', menu)">Smazat trvale</button>
                  } @else {
                    <button type="button" (click)="run(item.note, 'pin', menu)">
                      {{ item.note.pinned ? 'Odepnout' : 'Připnout' }}
                    </button>
                    @if (item.note.archived) {
                      <button type="button" (click)="run(item.note, 'unarchive', menu)">Vrátit z archivu</button>
                    } @else {
                      <button type="button" (click)="run(item.note, 'archive', menu)">Archivovat</button>
                    }
                    <button type="button" (click)="run(item.note, 'template', menu)">Uložit jako šablonu</button>
                    <button type="button" (click)="run(item.note, 'trash', menu)">Smazat</button>
                    <div class="swatches" role="group" aria-label="Barva">
                      <button
                        type="button"
                        class="swatch none"
                        aria-label="Bez barvy"
                        [attr.aria-pressed]="colorVar(item.note.color) === null"
                        (click)="run(item.note, 'color', menu)"
                      ></button>
                      @for (color of colors; track color.id) {
                        <button
                          type="button"
                          class="swatch"
                          [attr.aria-label]="color.label"
                          [attr.aria-pressed]="item.note.color === color.id"
                          [style.--swatch]="colorVar(color.id)"
                          (click)="run(item.note, 'color', menu, color.id)"
                        ></button>
                      }
                    </div>
                    @if (categories().length > 0) {
                      <div class="menu-categories" role="group" aria-label="Kategorie">
                        @for (cat of categories(); track cat.id) {
                          <button
                            type="button"
                            [style.--cat]="catVar(cat)"
                            [attr.aria-pressed]="item.note.categoryId === cat.id"
                            (click)="run(item.note, 'category', menu, undefined, item.note.categoryId === cat.id ? undefined : cat.id)"
                          >
                            <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconPath(cat.icon)" /></svg>
                            {{ cat.name }}
                          </button>
                        }
                      </div>
                    }
                  }
                </div>
              }
            </li>
          }
        </ul>
      }
      @if (trashedTasks().length > 0) {
        <div class="label">
          <h2>Úkoly</h2>
          <span aria-hidden="true">{{ trashedTasks().length }}</span>
        </div>
        <ul class="notes">
          @for (task of trashedTasks(); track task.id) {
            <li [attr.data-task]="task.id">
              <div class="body">
                <span class="title">{{ task.title }}</span>
              </div>
              <span class="task-actions">
                <button type="button" [attr.aria-label]="'Obnovit: ' + task.title" (click)="runTask(task, 'restore')">Obnovit</button>
                <button type="button" [attr.aria-label]="'Smazat trvale: ' + task.title" (click)="runTask(task, 'delete')">
                  Smazat trvale
                </button>
              </span>
            </li>
          }
        </ul>
      }
    }

    @if (!pane() && templates().length > 0) {
      <button type="button" class="icon-btn from-template" popovertarget="templates-menu" title="Ze šablony">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true">
          <path [attr.d]="icons.template" />
        </svg>
        <span class="visually-hidden">Ze šablony</span>
      </button>
      <div id="templates-menu" class="menu" popover (toggle)="onMenuToggle($event)">
        @for (template of templates(); track template.id) {
          <a routerLink="/new" [queryParams]="{ template: template.id }" (click)="flushQuery()">{{
            template.title || 'Bez názvu'
          }}</a>
        }
      </div>
    }

    @if (!pane()) {
      <a class="fab" routerLink="/new" aria-label="Nová poznámka" (click)="flushQuery()">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.plus" /></svg>
        Nová
      </a>
    }
  `,
  styles: `
    :host {
      display: block;
      padding-top: env(safe-area-inset-top);
      padding-bottom: calc(10.5rem + env(safe-area-inset-bottom));
    }

    :host(.with-templates) {
      padding-bottom: calc(14rem + env(safe-area-inset-bottom));
    }

    // Hlavička jako obrazovka 02 návrhu D: počet, velký nadpis, skleněná tlačítka vpravo
    .app-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 64px;
      padding: 8px 16px 0;
    }

    .heading {
      flex: 1;
      min-width: 0;
    }

    h1 {
      display: flex;
      align-items: center;
      margin: 0;
      font-family: var(--title-font);
      font-size: var(--title-size);
      font-weight: var(--title-weight);
      letter-spacing: var(--title-spacing);
    }

    h1:focus:not(:focus-visible) {
      outline: none;
    }

    // Od 900 px nese značku panel: nadpis je jen „Poznámky“, FAB a „Dnešní poznámku“ v hlavičce nahradí odkazy v panelu
    @media (min-width: 900px) {
      .app-logo,
      .app-name,
      .app-bar a,
      .fab {
        display: none;
      }

      .view-name {
        position: static;
        width: auto;
        height: auto;
        clip-path: none;
      }
    }

    .app-bar .icon-btn {
      width: var(--target);
      height: var(--target);
      border: 1px solid var(--glass-border);
      border-radius: 14px;
      background: var(--glass);
      color: var(--on-surface);
    }

    .app-bar .on {
      background: var(--primary-container);
      color: var(--on-primary-container);
    }

    .search {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 50px;
      margin: 12px 16px;
      padding: 0 8px 0 16px;
      border: 1px solid var(--search-border);
      border-radius: var(--search-radius);
      background: var(--search-bg);
      color: var(--on-surface-variant);
    }

    .search:focus-within {
      outline: 2px solid var(--ring);
    }

    .search input {
      flex: 1;
      min-width: 0;
      min-height: 44px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--on-surface);
      font: inherit;
    }

    .search input:focus {
      outline: none;
    }

    .search input::placeholder {
      color: var(--on-surface-variant);
    }

    // Štítek „/“ má sdílený vzhled ze styles.scss
    kbd:not(.key-hint) {
      padding: 0 6px;
      border: 1px solid var(--outline-variant);
      border-radius: 4px;
      font-family: var(--mono);
      font-size: 0.8125rem;
    }

    .chips.categories .icon {
      width: 18px;
      height: 18px;
      color: var(--cat);
    }

    .chips a[aria-current] .icon {
      color: inherit;
    }

    .note-cat {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--on-surface-variant);
      font-size: 0.8125rem;
      font-weight: 600;
    }

    .note-cat .icon {
      width: 16px;
      height: 16px;
      color: var(--cat);
    }

    .backup {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 0 16px 12px;
      padding: 4px 4px 4px 16px;
      border-radius: var(--radius-m);
      background: var(--primary-container);
      color: var(--on-primary-container);
    }

    /* Prstenec fokusu v barvě textu banneru, primary na primary-container nemá kontrast */
    .backup a:focus-visible {
      outline-color: currentColor;
    }

    .backup a {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 0 12px;
      color: inherit;
      font-weight: 600;
    }

    .hint,
    .error {
      margin: 0 16px 12px;
    }

    .hint {
      color: var(--on-surface-variant);
    }

    .error {
      color: var(--error);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      margin-top: 96px;
      padding: 0 16px;
      text-align: center;
    }

    .empty-state .icon {
      box-sizing: content-box;
      width: 56px;
      height: 56px;
      padding: 32px;
      border-radius: 50%;
      background: var(--primary-container);
      color: var(--on-primary-container);
    }

    .empty {
      margin: 0;
      font-family: var(--title-font);
      font-size: 1.25rem;
      font-weight: 700;
    }

    // Záhlaví sekce mono verzálkami, počet vpravo
    .label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 16px 20px 8px;
      color: var(--on-surface-variant);
      font-family: var(--mono);
      font-size: 0.8125rem;
    }

    .label h2 {
      margin: 0;
      font-size: inherit;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .notes {
      margin: 0;
      padding: 0 16px;
      list-style: none;
    }

    li {
      position: relative;
      margin-bottom: var(--card-gap);
      border: 1px solid var(--card-border);
      border-bottom-color: var(--card-divider, var(--card-border));
      border-radius: var(--card-radius);
      background: var(--card-bg);
      box-shadow: var(--card-shadow);
    }

    li.pinned {
      border-color: var(--card-pinned-border);
      border-bottom-color: var(--card-divider, var(--card-pinned-border));
      background: var(--card-pinned-bg);
    }

    /* Akcent na barevné kartě v barvě textu kvůli kontrastu; nahoře sytý okraj podle barvy (návrh D) */
    li.colored {
      --primary: var(--on-surface);
      border-color: transparent;
      border-top: 3px solid var(--note-edge);
      background: var(--note-bg);
    }

    .notes.grid {
      column-count: 2;
      column-gap: 10px;
    }

    .notes.grid li {
      break-inside: avoid;
      margin-bottom: 10px;
    }

    .notes.grid .snippet {
      -webkit-line-clamp: 6;
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px 14px 12px;
      border-radius: inherit;
      color: inherit;
      text-decoration: none;
    }

    // Místo vpravo nahoře pro ⋮
    .title {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-right: 30px;
      font-family: var(--title-font);
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .title .pin {
      width: 16px;
      height: 16px;
      margin-left: auto;
      color: var(--pin);
    }

    .snippet {
      display: -webkit-box;
      overflow: hidden;
      color: var(--on-surface-variant);
      font-size: 0.875rem;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    // Náhled checklistu: hotové přeškrtnuté s plným čtverečkem
    .rows {
      display: grid;
      gap: 4px;
      color: var(--on-surface-variant);
      font-size: 0.875rem;
    }

    .rows > span {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .box {
      flex: none;
      box-sizing: border-box;
      width: 14px;
      height: 14px;
      border: 1.5px solid currentColor;
      border-radius: 4px;
    }

    .rows .ok {
      text-decoration: line-through;
    }

    .ok .box {
      background: currentColor;
    }

    .foot {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 4px 8px;
      color: var(--on-surface-variant);
      font-family: var(--mono);
      font-size: 0.8125rem;
    }

    .note-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
    }

    // Úkol v koši: název přes celou šířku, tlačítka vpravo (bez ⋮, proto bez místa pro něj)
    li[data-task] {
      display: flex;
      align-items: center;
      padding-right: 4px;
    }

    li[data-task] .body {
      flex: 1;
      min-width: 0;
    }

    li[data-task] .title {
      padding-right: 0;
    }

    .task-actions {
      display: flex;
      flex-wrap: wrap;
    }

    .task-actions button {
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

    .actions {
      position: absolute;
      top: 2px;
      right: 2px;
      width: var(--target);
      height: var(--target);
    }

    .from-template {
      position: fixed;
      right: 20px;
      bottom: calc(102px + 56px + 12px + env(safe-area-inset-bottom));
      background: var(--surface-high);
      color: var(--on-surface);
      box-shadow: 0 3px 8px rgb(0 0 0 / 25%);
    }

    // Od 900 px dole lišta ani FAB nejsou: „Ze šablony“ sedí 24 px nad spodkem, mřížka má sloupce podle šířky
    @media (min-width: 900px) {
      :host {
        padding-bottom: calc(2rem + env(safe-area-inset-bottom));
      }

      :host(.with-templates) {
        padding-bottom: calc(6rem + env(safe-area-inset-bottom));
      }

      .from-template {
        bottom: calc(24px + env(safe-area-inset-bottom));
      }

      .notes.grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
        gap: 10px;
        align-items: start;
      }

      .notes.grid li {
        margin: 0;
      }
    }

    // Ve vysokém kontrastu se zapnutý stav (tónovaná plocha, plný čtvereček) kreslí systémovými barvami
    @media (forced-colors: active) {
      .app-bar .on {
        forced-color-adjust: none;
        background: Highlight;
        color: HighlightText;
      }

      .ok .box {
        forced-color-adjust: none;
        background: CanvasText;
      }
    }
  `,
})
export class NotesList implements OnInit {
  protected readonly icons = ICONS;
  protected readonly iconsRegular = ICONS_REGULAR;
  protected readonly iconsFill = ICONS_FILL;
  readonly view = input<string>();
  readonly tag = input<string>();
  // Filtr podle kategorie z ?category=
  readonly category = input<string>();
  readonly q = input<string>();
  // Kompaktní seznam vedle editoru (tn-split)
  readonly pane = input(false, { transform: booleanAttribute });
  // Počet uložení v editoru vedle seznamu a id poznámky v něm otevřené
  readonly saves = input(0);
  readonly openId = input<string>();

  private readonly repository = inject(NotesRepository);
  private readonly categoriesRepository = inject(CategoriesRepository);
  private readonly tasksRepository = inject(TasksRepository);
  private readonly taskActions = inject(TaskActions);
  private readonly actions = inject(NoteActions);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  // Po návratu z editoru vedle seznamu se fokus vrátí na kartu poznámky (bez ní na nadpis); navigace běží jen při vytvoření
  private readonly returnFocus: unknown = this.router.currentNavigation()?.extras.state?.['focus'];
  private urlTimer?: ReturnType<typeof setTimeout>;
  private midnightTimer?: ReturnType<typeof setTimeout>;
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly notes = signal<Note[]>([]);
  private readonly tasks = signal<Task[]>([]);
  // Prázdný stav až po načtení, ať při otevření neproblikne
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  // Text pole hledání, do URL se zapisuje se zpožděním
  protected readonly query = signal('');

  protected readonly current = computed(() => {
    const view = this.view();
    return VIEWS.find((item) => item.view === (isNotesView(view) ? view : 'notes')) ?? VIEWS[0];
  });
  // Hláška o chybě akce do změny pohledu nebo tagu
  protected readonly actionFailed = linkedSignal({
    source: () => `${this.current().view}|${this.tag() ?? ''}`,
    computation: () => false,
  });
  protected readonly viewParam = computed(() => (this.current().view === 'notes' ? null : this.current().view));
  protected readonly queryParam = computed(() => (this.query().trim() ? this.query() : null));
  // Připomínka zálohy jen v poznámkách
  protected readonly backupDays = computed(() =>
    this.current().view === 'notes' ? daysWithoutBackup(readLastBackup(), this.notes(), new Date()) : undefined,
  );
  protected readonly tags = computed(() => collectTags(this.notes(), this.current().view));
  protected readonly templates = computed(() => templatesOf(this.notes()));
  protected readonly colors = NOTE_COLORS;
  protected readonly categories = signal<Category[]>([]);
  protected readonly iconPath = categoryIconPath;
  // Neznámé id kategorie (smazaná) filtr nepoužije
  protected readonly activeCategory = computed(() => this.categories().find((item) => item.id === this.category()));
  protected readonly colorVar = noteColorVar;
  protected readonly grid = signal(readLayout() === 'grid');
  private readonly search = computed(() => createNoteSearch(this.notes()));
  // Dnešek pro „dnes“ / „včera“ na kartách, přepočítává se o půlnoci a po návratu do aplikace
  private readonly today = signal(localDate(new Date()));
  protected readonly items = computed(() => {
    const category = this.activeCategory();
    const notes = queryNotes(this.notes(), this.current().view, this.tag()).filter(
      (note) => !category || note.categoryId === category.id,
    );
    const query = this.queryParam();
    const today = this.today();
    return (query ? this.search()(query, notes) : notes).map((note) => {
      // Řádky checklistu pro náhled na kartě a počet hotových („4/7“)
      const rows = parseSegments(note.content).flatMap((segment) => (segment.kind === 'checklist' ? [...segment.open, ...segment.done] : []));
      return {
        note,
        title: note.title || 'Bez názvu',
        snippet: snippet(note.content),
        rows,
        done: rows.filter((row) => row.checked).length,
        date: dateLabel(note.updatedAt, today),
      };
    });
  });
  // Počet poznámek v pohledu nad nadpisem („3 poznámky“); před načtením pevná mezera drží výšku řádku
  protected readonly countLine = computed(() => {
    if (!this.loaded() || this.loadFailed()) {
      return ' ';
    }
    const count = this.items().length;
    return `${count} ${count === 1 ? 'poznámka' : count >= 2 && count <= 4 ? 'poznámky' : 'poznámek'}`;
  });
  // Nápověda / a Ctrl F v hledání jen se zapnutými zkratkami
  protected readonly shortcuts = readShortcutsEnabled();
  // Připnuté zvlášť, jen v poznámkách bez hledání (výsledky drží pořadí podle relevance)
  protected readonly groups = computed(() => {
    const items = this.items();
    const pinned = items.filter((item) => item.note.pinned);
    if (this.current().view !== 'notes' || this.queryParam() || pinned.length === 0) {
      return [{ label: '', items }];
    }
    return [
      { label: 'Připnuté', items: pinned },
      { label: 'Ostatní', items: items.filter((item) => !item.note.pinned) },
    ].filter((group) => group.items.length > 0);
  });
  protected readonly found = computed(() => {
    if (!this.queryParam() || this.loadFailed()) {
      return '';
    }
    const count = this.items().length;
    if (count === 1) {
      return 'Nalezena 1 poznámka';
    }
    return count >= 2 && count <= 4 ? `Nalezeny ${count} poznámky` : `Nalezeno ${count} poznámek`;
  });

  constructor() {
    // Po uložení v editoru vedle se seznam načte znovu (první načtení dělá ngOnInit)
    effect(() => {
      if (this.saves() > 0) {
        untracked(() => void this.load());
      }
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.urlTimer);
      clearTimeout(this.midnightTimer);
    });
  }

  async ngOnInit(): Promise<void> {
    this.query.set(this.q() ?? '');
    this.refreshToday();
    await this.load();
    const focus = this.returnFocus;
    if (typeof focus === 'string') {
      afterNextRender(() => this.restoreFocus(focus, -1, true), { injector: this.injector });
    }
  }

  protected refreshToday(): void {
    const now = new Date();
    this.today.set(localDate(now));
    clearTimeout(this.midnightTimer);
    this.midnightTimer = setTimeout(() => this.refreshToday(), new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime());
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    clearTimeout(this.urlTimer);
    this.urlTimer = setTimeout(
      () => this.router.navigate([], { ...this.queryUrlOptions(), replaceUrl: true }),
      URL_DEBOUNCE_MS,
    );
  }

  // Nezapsané hledání se před odchodem uloží do aktuální položky historie
  protected flushQuery(): void {
    clearTimeout(this.urlTimer);
    this.location.replaceState(this.router.createUrlTree([], this.queryUrlOptions()).toString());
  }

  private queryUrlOptions() {
    return { relativeTo: this.route, queryParams: { q: this.queryParam() }, queryParamsHandling: 'merge' as const };
  }

  // Fokus na první akci otevřené nabídky
  protected onMenuToggle(event: Event): void {
    if ('newState' in event && event.newState === 'open') {
      (event.target as HTMLElement).querySelector<HTMLElement>('button, a')?.focus();
    }
  }

  protected toggleGrid(): void {
    this.grid.update((grid) => !grid);
    try {
      localStorage.setItem(LAYOUT_KEY, this.grid() ? 'grid' : 'list');
    } catch {
      // Bez úložiště platí rozložení jen do zavření
    }
  }

  // Zkratky seznamu; akce P, A, Delete platí pro poznámku s fokusem
  protected onKey(event: KeyboardEvent): void {
    if (!readShortcutsEnabled() || event.isComposing || event.defaultPrevented) {
      return;
    }
    // Vedle editoru jen s fokusem v seznamu, zkratky editoru zůstávají jeho
    if (this.pane() && !this.host.contains(document.activeElement)) {
      return;
    }
    // Ctrl+F hledá v poznámkách místo hledání na stránce
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
      this.field().nativeElement.focus();
      event.preventDefault();
      return;
    }
    if (!isPlainKey(event)) {
      return;
    }
    const active = document.activeElement;
    const item = active?.closest<HTMLElement>('li[data-id]') ?? undefined;
    const note = this.notes().find((note) => note.id === item?.dataset['id']);
    // Písmena platí i se zapnutým Caps Lockem
    switch (event.key.length === 1 ? event.key.toLowerCase() : event.key) {
      case 'n':
        this.flushQuery();
        void this.router.navigate(['/new']);
        break;
      case 'd':
        this.flushQuery();
        void this.router.navigate(['/today']);
        break;
      case '/':
        this.field().nativeElement.focus();
        break;
      case 'ArrowDown':
      case 'ArrowUp': {
        // Šipky jen na poznámce nebo bez fokusu; v nabídce ⋮, se Shiftem (výběr) a jinde zůstává výchozí chování
        const free = active === document.body || active === this.heading()?.nativeElement;
        if (event.shiftKey || active?.closest('.menu') || (!item && !free)) {
          return;
        }
        this.moveFocus(item, event.key === 'ArrowDown' ? 1 : -1);
        break;
      }
      case '?':
        this.flushQuery();
        void this.router.navigate(['/settings'], { fragment: 'shortcuts' });
        break;
      case 'p':
      case 'a':
      case 'Delete': {
        const menu = item?.querySelector<HTMLElement>('.menu');
        // Podržená klávesa akci neopakuje
        if (!note || !menu || event.repeat || this.current().view === 'trash') {
          return;
        }
        const key = event.key.toLowerCase();
        const action = key === 'p' ? 'pin' : key === 'delete' ? 'trash' : note.archived ? 'unarchive' : 'archive';
        void this.run(note, action, menu);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  }

  // Bez vybrané poznámky šipka dolů začne první a nahoru poslední
  private moveFocus(item: HTMLElement | undefined, step: number): void {
    const items = [...this.host.querySelectorAll<HTMLElement>('li[data-id]')];
    const index = item ? items.indexOf(item) + step : step > 0 ? 0 : items.length - 1;
    items[Math.max(0, Math.min(index, items.length - 1))]?.querySelector<HTMLElement>('a.body, .actions')?.focus();
  }

  protected categoryOf(note: Note): Category | undefined {
    return this.categories().find((item) => item.id === note.categoryId);
  }

  protected catVar(category: Category): string {
    return `var(--c-${category.color})`;
  }

  protected async run(note: Note, action: NoteAction, menu: HTMLElement, color?: NoteColor, categoryId?: string): Promise<void> {
    if (action === 'delete' && !confirm(`Smazat poznámku „${note.title || 'Bez názvu'}“ trvale?`)) {
      return;
    }
    menu.hidePopover?.();
    // Po akci ze zkratky se fokus vrátí na odkaz poznámky, jinak na ⋮
    const focusLink = document.activeElement?.matches('a.body') ?? false;
    const index = this.items().findIndex((item) => item.note.id === note.id);
    this.actionFailed.set(false);
    try {
      await this.perform(note, action, color, categoryId);
    } catch {
      this.actionFailed.set(true);
    }
    await this.load();
    afterNextRender(() => this.restoreFocus(note.id, index, focusLink), { injector: this.injector });
  }

  private perform(note: Note, action: NoteAction, color?: NoteColor, categoryId?: string): Promise<void> {
    switch (action) {
      case 'pin':
        return this.actions.togglePin(note);
      case 'archive':
      case 'unarchive':
        return this.actions.setArchived(note, action === 'archive');
      case 'template':
        return this.actions.setTemplate(note, true);
      case 'color':
        return this.actions.setColor(note, color);
      case 'category':
        return this.actions.setCategory(note, categoryId);
      case 'trash':
        return this.actions.trash(note);
      case 'restore':
        return this.actions.restore(note);
      case 'delete':
        return this.actions.deletePermanently(note);
    }
  }

  private async load(): Promise<void> {
    // Kategorie a poznámky najednou, aby filtr neproblikl nefiltrovaným seznamem
    const [categories, notes] = await Promise.all([
      this.categoriesRepository.getAll().catch(() => this.categories()),
      this.repository.getAll().catch(() => undefined),
    ]);
    this.categories.set(categories);
    if (notes) {
      this.notes.set(notes);
    }
    this.loadFailed.set(!notes);
    this.loaded.set(true);
    // Úkoly jen pro koš; chyba nebrání zobrazení poznámek
    this.tasks.set(await this.tasksRepository.getAll().catch(() => this.tasks()));
  }

  // Smazané úkoly v koši, poslední smazaný nahoře; hledá se jako u poznámek (bez diakritiky, všechna slova
  // jako začátky slov v názvu), s tagem se nezobrazí (úkoly tagy nemají)
  protected readonly trashedTasks = computed(() => {
    const { text, tags } = parseQuery(this.queryParam() ?? '');
    if (this.current().view !== 'trash' || this.tag() || tags.length > 0) {
      return [];
    }
    const words = normalizeTerm(text).split(/\s+/).filter(Boolean);
    const matches = (title: string) => {
      const titleWords = normalizeTerm(title).split(/[^\p{L}\p{N}]+/u);
      return words.every((word) => titleWords.some((titleWord) => titleWord.startsWith(word)));
    };
    const category = this.activeCategory();
    return this.tasks()
      .filter((task) => task.deletedAt && matches(task.title) && (!category || task.categoryId === category.id))
      .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
  });

  protected async runTask(task: Task, action: 'restore' | 'delete'): Promise<void> {
    if (action === 'delete' && !confirm(`Smazat úkol „${task.title}“ trvale?`)) {
      return;
    }
    this.actionFailed.set(false);
    try {
      await (action === 'restore' ? this.taskActions.restore(task) : this.taskActions.deletePermanently(task));
    } catch {
      this.actionFailed.set(true);
    }
    await this.load();
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  // Fokus na tutéž poznámku, jinak na položku na stejné pozici, jinak na nadpis
  private restoreFocus(id: string, index: number, focusLink: boolean): void {
    const items = [...this.host.querySelectorAll<HTMLElement>('li[data-id]')];
    const target = items.find((item) => item.dataset['id'] === id) ?? items[Math.min(index, items.length - 1)];
    (target?.querySelector<HTMLElement>(focusLink ? 'a.body, .actions' : '.actions') ?? this.heading()?.nativeElement)?.focus();
  }
}

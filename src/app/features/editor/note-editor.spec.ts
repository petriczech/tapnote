import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { createNote } from '../../core/model/note';
import { NotesRepository } from '../../core/storage/notes-repository';
import { InMemoryNotesRepository } from '../../core/storage/testing/in-memory-notes-repository';
import { ParamsRouteReuseStrategy } from '../../params-route-reuse-strategy';
import { NoteDraft } from './note-draft';
import { NoteEditor } from './note-editor';
import { VersionsRepository } from '../../core/storage/versions-repository';
import { InMemoryVersionsRepository } from '../../core/storage/testing/in-memory-versions-repository';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { InMemoryCategoriesRepository } from '../../core/storage/testing/in-memory-categories-repository';

describe('NoteEditor', () => {
  let repository: InMemoryNotesRepository;
  let categories: InMemoryCategoriesRepository;

  beforeEach(() => {
    repository = new InMemoryNotesRepository();
    categories = new InMemoryCategoriesRepository();
    TestBed.configureTestingModule({
      imports: [NoteEditor],
      providers: [
        provideRouter([{ path: 'note/:id', component: NoteEditor }], withComponentInputBinding()),
        { provide: RouteReuseStrategy, useClass: ParamsRouteReuseStrategy },
        { provide: NotesRepository, useValue: repository }, { provide: VersionsRepository, useClass: InMemoryVersionsRepository },
        { provide: CategoriesRepository, useValue: categories },
      ],
    });
  });

  function textareaOf(root: HTMLElement): HTMLTextAreaElement {
    return root.querySelector('textarea') as HTMLTextAreaElement;
  }

  it('focuses the textarea after render', async () => {
    const fixture = TestBed.createComponent(NoteEditor);
    await fixture.whenStable();

    expect(document.activeElement).toBe(textareaOf(fixture.nativeElement));
  });

  it('starts from a template with the cursor at its marker and saves nothing untouched', async () => {
    await repository.put({ ...createNote('tpl', '2026-10-15T10:00:00.000Z'), content: 'Porada\nÚčastníci: {{cursor}}\nZávěry:', isTemplate: true });
    const fixture = TestBed.createComponent(NoteEditor);
    fixture.componentRef.setInput('template', 'tpl');
    await fixture.whenStable();
    const textarea = textareaOf(fixture.nativeElement);

    await vi.waitFor(() => expect(textarea.value).toBe('Porada\nÚčastníci: \nZávěry:'));
    await vi.waitFor(() => expect(textarea.selectionStart).toBe('Porada\nÚčastníci: '.length));
    expect(document.activeElement).toBe(textarea);
    expect(fixture.nativeElement.textContent).not.toContain('Uloženo');

    const draft = fixture.debugElement.injector.get(NoteDraft);
    fixture.destroy();
    await draft.flush();
    expect(repository.notes.size).toBe(1);
  });

  it('shows the note color as the editor background', async () => {
    await repository.put({ ...createNote('1', '2026-10-15T10:00:00.000Z'), content: 'barevná', color: 'yellow' });
    const fixture = TestBed.createComponent(NoteEditor);
    fixture.componentRef.setInput('id', '1');
    const host: HTMLElement = fixture.nativeElement;

    await vi.waitFor(() => expect(textareaOf(host).value).toBe('barevná'));
    await fixture.whenStable();

    expect(host.style.getPropertyValue('--note-bg')).toBe('var(--note-yellow)');
    expect(host.classList).toContain('colored');
  });

  it('saves typed text when destroyed', async () => {
    const fixture = TestBed.createComponent(NoteEditor);
    await fixture.whenStable();
    const draft = fixture.debugElement.injector.get(NoteDraft);

    const textarea = textareaOf(fixture.nativeElement);
    textarea.value = 'ahoj';
    textarea.dispatchEvent(new Event('input'));
    fixture.destroy();
    await draft.flush();

    expect([...repository.notes.values()].map((note) => note.content)).toEqual(['ahoj']);
  });

  it('opens a fresh editor when the route id changes', async () => {
    await repository.bulkPut([
      { ...createNote('1', '2026-10-15T10:00:00.000Z'), content: 'první' },
      { ...createNote('2', '2026-10-15T10:00:00.000Z'), content: 'druhá' },
    ]);
    const harness = await RouterTestingHarness.create();

    const first = await harness.navigateByUrl('/note/1', NoteEditor);
    await vi.waitFor(() => expect(textareaOf(harness.routeNativeElement!).value).toBe('první'));

    const second = await harness.navigateByUrl('/note/2', NoteEditor);
    await vi.waitFor(() => expect(textareaOf(harness.routeNativeElement!).value).toBe('druhá'));
    expect(second).not.toBe(first);
  });

  it('redirects to a new note when the id does not exist', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(NoteEditor);
    fixture.componentRef.setInput('id', 'missing');

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/new'], { replaceUrl: true }));
  });

  it('does not redirect after the editor is destroyed', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    let resolveGet!: (note: undefined) => void;
    const get = vi.spyOn(repository, 'get').mockReturnValue(new Promise((resolve) => (resolveGet = resolve)));
    const fixture = TestBed.createComponent(NoteEditor);
    fixture.componentRef.setInput('id', 'missing');
    await fixture.whenStable();
    expect(get).toHaveBeenCalledWith('missing');

    fixture.destroy();
    resolveGet(undefined);
    await new Promise((resolve) => setTimeout(resolve));

    expect(navigate).not.toHaveBeenCalled();
  });

  // Štítek zkratky (kbd, skrytý čtečkám) do názvu tlačítka nepatří
  function buttonOf(root: HTMLElement, text: string): HTMLButtonElement {
    return [...root.querySelectorAll('button')].find(
      (button) => button.textContent?.replace(button.querySelector('kbd')?.textContent ?? '', '').trim() === text,
    ) as HTMLButtonElement;
  }

  function type(textarea: HTMLTextAreaElement, value: string): void {
    textarea.value = value;
    textarea.setSelectionRange(value.length, value.length);
    textarea.dispatchEvent(new Event('input'));
  }

  it('continues a checklist on Enter', async () => {
    const fixture = TestBed.createComponent(NoteEditor);
    await fixture.whenStable();
    const textarea = textareaOf(fixture.nativeElement);
    type(textarea, '- [ ] mléko');

    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    textarea.dispatchEvent(enter);

    expect(enter.defaultPrevented).toBe(true);
    expect(textarea.value).toBe('- [ ] mléko\n- [ ] ');
    expect(fixture.debugElement.injector.get(NoteDraft).content()).toBe('- [ ] mléko\n- [ ] ');
  });

  it('keeps the default Enter outside a checklist', async () => {
    const fixture = TestBed.createComponent(NoteEditor);
    await fixture.whenStable();
    const textarea = textareaOf(fixture.nativeElement);
    type(textarea, 'text');

    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    textarea.dispatchEvent(enter);

    expect(enter.defaultPrevented).toBe(false);
  });

  it('turns the current line into an item', async () => {
    const fixture = TestBed.createComponent(NoteEditor);
    await fixture.whenStable();
    const textarea = textareaOf(fixture.nativeElement);
    type(textarea, 'mléko');

    buttonOf(fixture.nativeElement, 'Checklist').click();

    expect(textarea.value).toBe('- [ ] mléko');
    expect(textarea.selectionStart).toBe(11);
  });

  it('toggles an item in the view and moves focus between modes', async () => {
    const fixture = TestBed.createComponent(NoteEditor);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    type(textareaOf(root), '- [ ] a\n- [ ] b');

    buttonOf(root, 'Hotovo').click();
    await fixture.whenStable();
    expect(textareaOf(root)).toBeNull();
    expect(document.activeElement).toBe(buttonOf(root, 'Upravit'));

    root.querySelector<HTMLInputElement>('input[type=checkbox]')?.click();
    await fixture.whenStable();
    expect(fixture.debugElement.injector.get(NoteDraft).content()).toBe('- [ ] b\n- [x] a');

    buttonOf(root, 'Upravit').click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(textareaOf(root));
  });

  it('opens a note with a checklist in the view', async () => {
    await repository.put({ ...createNote('1', '2026-10-15T10:00:00.000Z'), content: '- [ ] mléko' });
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/note/1', NoteEditor);

    await vi.waitFor(() => expect(buttonOf(harness.routeNativeElement!, 'Upravit')).toBeTruthy());
    expect(textareaOf(harness.routeNativeElement!)).toBeNull();
  });

  it('shows the category, pin and edit time under the title in the view', async () => {
    const now = new Date();
    now.setHours(9, 38);
    await categories.put({ id: 'c1', name: 'Cesty', icon: 'home', color: 'blue', order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() });
    await repository.put({ ...createNote('1', now.toISOString()), content: 'Víkend\n- [x] klíče\n- [ ] spacák', pinned: true, categoryId: 'c1' });
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/note/1', NoteEditor);
    const root = harness.routeNativeElement!;

    await vi.waitFor(() => expect(root.querySelector('.meta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Cesty Připnuto upraveno 9:38'));
    expect(root.querySelector('h1')?.textContent).toBe('Víkend');
    expect(root.querySelector('progress')?.getAttribute('aria-labelledby')).toBe('checklist-progress');
    expect(root.querySelector('#checklist-progress')?.textContent).toBe('1 ze 2 splněno');
  });

  it('adds an empty item after the open items and edits it', async () => {
    await repository.put({ ...createNote('1', '2026-10-15T10:00:00.000Z'), content: 'Nákup\n- [ ] mléko\n- [x] chleba' });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/note/1', NoteEditor);
    const root = harness.routeNativeElement!;
    await vi.waitFor(() => expect(buttonOf(root, 'Přidat položku')).toBeTruthy());

    buttonOf(root, 'Přidat položku').click();
    await harness.fixture.whenStable();

    const textarea = textareaOf(root);
    expect(textarea.value).toBe('Nákup\n- [ ] mléko\n- [ ] \n- [x] chleba');
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe('Nákup\n- [ ] mléko\n- [ ] '.length);
  });

  it('adds an item with the indent of an indented checklist', async () => {
    await repository.put({ ...createNote('1', '2026-10-15T10:00:00.000Z'), content: 'Nákup\n  - [ ] mléko\n    - [ ] polotučné' });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/note/1', NoteEditor);
    const root = harness.routeNativeElement!;
    await vi.waitFor(() => expect(buttonOf(root, 'Přidat položku')).toBeTruthy());

    buttonOf(root, 'Přidat položku').click();
    await harness.fixture.whenStable();

    expect(textareaOf(root).value).toBe('Nákup\n  - [ ] mléko\n    - [ ] polotučné\n  - [ ] ');
  });

  describe('bottom toolbar', () => {
    function toolbarOf(root: HTMLElement): HTMLElement {
      return root.querySelector('[role=group][aria-label="Formát"]') as HTMLElement;
    }

    it('offers Checklist, Tag and Barva for a new note, and ⋯ once it is saved', async () => {
      const fixture = TestBed.createComponent(NoteEditor);
      await fixture.whenStable();
      const root: HTMLElement = fixture.nativeElement;
      expect([...toolbarOf(root).querySelectorAll('button')].map((button) => button.textContent?.trim())).toEqual(['Checklist', 'Tag', 'Barva']);

      type(textareaOf(root), 'ahoj');
      await fixture.debugElement.injector.get(NoteDraft).flush();
      await fixture.whenStable();
      expect(buttonOf(toolbarOf(root), 'Další akce').getAttribute('popovertarget')).toBe('more-menu');
    });

    it('inserts # at the cursor, with a space after a word', async () => {
      const fixture = TestBed.createComponent(NoteEditor);
      await fixture.whenStable();
      const textarea = textareaOf(fixture.nativeElement);
      type(textarea, 'Nákup ');

      buttonOf(fixture.nativeElement, 'Tag').click();
      expect(textarea.value).toBe('Nákup #');

      textarea.setSelectionRange(5, 5);
      buttonOf(fixture.nativeElement, 'Tag').click();
      expect(textarea.value).toBe('Nákup # #');
      expect(textarea.selectionStart).toBe(7);
      expect(document.activeElement).toBe(textarea);
      expect(fixture.debugElement.injector.get(NoteDraft).content()).toBe('Nákup # #');
    });

    it('switches from the view to editing and appends #', async () => {
      await repository.put({ ...createNote('1', '2026-10-15T10:00:00.000Z'), content: '- [ ] mléko' });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/note/1', NoteEditor);
      const root = harness.routeNativeElement!;
      await vi.waitFor(() => expect(buttonOf(root, 'Upravit')).toBeTruthy());

      buttonOf(root, 'Tag').click();
      await harness.fixture.whenStable();

      const textarea = textareaOf(root);
      expect(textarea.value).toBe('- [ ] mléko #');
      expect(document.activeElement).toBe(textarea);
      expect(textarea.selectionStart).toBe(textarea.value.length);
    });

    it('links to the history from the ⋯ menu', async () => {
      await repository.put({ ...createNote('1', '2026-10-15T10:00:00.000Z'), content: 'text' });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/note/1', NoteEditor);
      const root = harness.routeNativeElement!;

      await vi.waitFor(() => expect(root.querySelector('#more-menu')).toBeTruthy());
      const history = [...root.querySelectorAll<HTMLAnchorElement>('#more-menu a')].find((link) => link.textContent?.trim() === 'Historie');
      expect(history?.getAttribute('href')).toBe('/note/1/history');
    });

    it('saves the chosen color and keeps it while typing', async () => {
      await repository.put({ ...createNote('1', '2026-10-15T10:00:00.000Z'), content: 'text' });
      const fixture = TestBed.createComponent(NoteEditor);
      fixture.componentRef.setInput('id', '1');
      const root: HTMLElement = fixture.nativeElement;
      await vi.waitFor(() => expect(textareaOf(root).value).toBe('text'));
      type(textareaOf(root), 'text 2');

      root.querySelector<HTMLButtonElement>('#color-menu [aria-label="Modrá"]')!.click();
      await vi.waitFor(() => expect(repository.notes.get('1')).toMatchObject({ content: 'text 2', color: 'blue' }));
      await fixture.whenStable();
      expect(root.style.getPropertyValue('--note-bg')).toBe('var(--note-blue)');
      expect(root.querySelector('#color-menu [aria-label="Modrá"]')?.getAttribute('aria-pressed')).toBe('true');

      root.querySelector<HTMLButtonElement>('#color-menu [aria-label="Bez barvy"]')!.click();
      await vi.waitFor(() => expect(repository.notes.get('1')?.color).toBeUndefined());
    });

    it('pins, archives and moves the note to the trash like the list menu', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await repository.put({ ...createNote('1', '2026-10-15T10:00:00.000Z'), content: 'text' });
      const fixture = TestBed.createComponent(NoteEditor);
      fixture.componentRef.setInput('id', '1');
      const root: HTMLElement = fixture.nativeElement;
      await vi.waitFor(() => expect(root.querySelector('#more-menu')).toBeTruthy());
      const menu = root.querySelector('#more-menu') as HTMLElement;

      buttonOf(menu, 'Připnout').click();
      await vi.waitFor(() => expect(buttonOf(menu, 'Odepnout')).toBeTruthy());
      expect(repository.notes.get('1')?.pinned).toBe(true);

      buttonOf(menu, 'Archivovat').click();
      await vi.waitFor(() => expect(buttonOf(menu, 'Vrátit z archivu')).toBeTruthy());
      expect(repository.notes.get('1')?.archived).toBe(true);

      buttonOf(menu, 'Smazat').click();
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/notes']));
      expect(repository.notes.get('1')?.deletedAt).toBeDefined();
    });

    it('closes an open menu with Esc without leaving the editor', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const fixture = TestBed.createComponent(NoteEditor);
      await fixture.whenStable();
      const menu = (fixture.nativeElement as HTMLElement).querySelector('#color-menu');
      // jsdom popovery nepodporuje ani neotevírá, podpora i otevřená nabídka se proto podstrčí
      Object.defineProperty(HTMLElement.prototype, 'popover', { configurable: true, value: null });
      const query = document.querySelector.bind(document);
      const spy = vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => (selector === ':popover-open' ? menu : query(selector)));

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      spy.mockRestore();
      delete (HTMLElement.prototype as { popover?: unknown }).popover;

      expect(navigate).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it('shows the stored color again when saving the chosen color fails', async () => {
      await repository.put({ ...createNote('1', '2026-10-15T10:00:00.000Z'), content: 'text', color: 'yellow' });
      const fixture = TestBed.createComponent(NoteEditor);
      fixture.componentRef.setInput('id', '1');
      const root: HTMLElement = fixture.nativeElement;
      await vi.waitFor(() => expect(textareaOf(root).value).toBe('text'));
      vi.spyOn(repository, 'update').mockRejectedValue(new Error('x'));

      root.querySelector<HTMLButtonElement>('#color-menu [aria-label="Modrá"]')!.click();

      await vi.waitFor(() => expect(root.querySelector('.status')?.textContent?.trim()).toBe('Akci se nepodařilo dokončit.'));
      await fixture.whenStable();
      expect(root.style.getPropertyValue('--note-bg')).toBe('var(--note-yellow)');
    });
  });

  describe('links', () => {
    beforeEach(() =>
      repository.bulkPut([
        { ...createNote('1', '2026-10-15T10:00:00.000Z'), title: 'Nákup', content: 'Nákup\nviz [[Porada]]' },
        { ...createNote('2', '2026-10-15T10:00:00.000Z'), title: 'Porada', content: 'Porada\nzpět na [[nákup]]' },
        { ...createNote('3', '2026-10-15T10:00:00.000Z'), title: 'Jiná', content: 'Jiná' },
      ]),
    );

    function backlinkTitles(root: HTMLElement): string[] {
      return [...root.querySelectorAll('.backlinks a')].map((link) => link.textContent?.trim() ?? '');
    }

    it('opens a note with links in the view and lists notes linking here', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/note/1', NoteEditor);
      const root = harness.routeNativeElement!;

      await vi.waitFor(() => expect(root.querySelector('a.link')?.getAttribute('href')).toBe('/note/2'));
      expect(textareaOf(root)).toBeNull();
      expect(root.querySelector('.backlinks h2')?.textContent).toBe('Odkazuje sem');
      expect(backlinkTitles(root)).toEqual(['Porada']);
    });

    it('updates content, links and backlinks after following a link', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/note/1', NoteEditor);
      await vi.waitFor(() => expect(harness.routeNativeElement!.querySelector('a.link')).toBeTruthy());

      harness.routeNativeElement!.querySelector<HTMLAnchorElement>('a.link')!.click();
      await vi.waitFor(() => expect(harness.routeNativeElement!.textContent).toContain('zpět na'));
      const root = harness.routeNativeElement!;

      await vi.waitFor(() => expect(root.querySelector('a.link')?.getAttribute('href')).toBe('/note/1'));
      expect(backlinkTitles(root)).toEqual(['Nákup']);
    });

    it('hides the section without backlinks', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/note/3', NoteEditor);

      await vi.waitFor(() => expect(textareaOf(harness.routeNativeElement!).value).toBe('Jiná'));
      expect(harness.routeNativeElement!.querySelector('.backlinks')).toBeNull();
    });
  });

  describe('keyboard shortcuts', () => {
    function press(init: KeyboardEventInit): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      (document.activeElement ?? document.body).dispatchEvent(event);
      return event;
    }

    it('goes back to the list with Esc', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const fixture = TestBed.createComponent(NoteEditor);
      await fixture.whenStable();

      press({ key: 'Escape' });

      expect(navigate).toHaveBeenCalledWith(['/notes'], { queryParamsHandling: 'preserve', state: undefined });
    });

    it('switches modes with Ctrl+Enter and adds an item with Ctrl+Shift+L', async () => {
      const fixture = TestBed.createComponent(NoteEditor);
      await fixture.whenStable();
      const root: HTMLElement = fixture.nativeElement;
      type(textareaOf(root), 'mléko');

      press({ key: 'L', code: 'KeyL', ctrlKey: true, shiftKey: true });
      expect(textareaOf(root).value).toBe('- [ ] mléko');

      press({ key: 'Enter', ctrlKey: true });
      await fixture.whenStable();
      expect(textareaOf(root)).toBeNull();

      press({ key: 'Enter', ctrlKey: true });
      await fixture.whenStable();
      expect(document.activeElement).toBe(textareaOf(root));
    });
  });
});

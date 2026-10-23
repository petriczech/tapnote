import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { createNote } from '../../core/model/note';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { NotesRepository } from '../../core/storage/notes-repository';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { InMemoryCategoriesRepository } from '../../core/storage/testing/in-memory-categories-repository';
import { InMemoryNotesRepository } from '../../core/storage/testing/in-memory-notes-repository';
import { InMemoryTasksRepository } from '../../core/storage/testing/in-memory-tasks-repository';
import { InMemoryVersionsRepository } from '../../core/storage/testing/in-memory-versions-repository';
import { VersionsRepository } from '../../core/storage/versions-repository';
import { NoteEditor } from '../editor/note-editor';
import { ParamsRouteReuseStrategy } from '../../params-route-reuse-strategy';
import { Split } from './split';

describe('Split', () => {
  let wide: boolean;
  let listeners: ((event: { matches: boolean }) => void)[];
  let repository: InMemoryNotesRepository;

  beforeEach(async () => {
    wide = true;
    listeners = [];
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return wide;
      },
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.push(listener),
      removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
        (listeners = listeners.filter((item) => item !== listener)),
    }));
    repository = new InMemoryNotesRepository();
    await repository.bulkPut([
      { ...createNote('a', '2026-10-15T10:00:00.000Z'), title: 'První', content: 'První', tags: ['x'] },
      { ...createNote('b', '2026-10-15T11:00:00.000Z'), title: 'Druhá', content: 'Druhá', tags: ['x'] },
    ]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            {
              path: '',
              component: Split,
              children: [
                { path: 'new', component: NoteEditor },
                { path: 'note/:id', component: NoteEditor },
              ],
            },
          ],
          withComponentInputBinding(),
        ),
        { provide: RouteReuseStrategy, useClass: ParamsRouteReuseStrategy },
        { provide: NotesRepository, useValue: repository },
        { provide: VersionsRepository, useClass: InMemoryVersionsRepository },
        { provide: TasksRepository, useClass: InMemoryTasksRepository },
        { provide: CategoriesRepository, useClass: InMemoryCategoriesRepository },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function open(url: string): Promise<{ harness: RouterTestingHarness; root: HTMLElement }> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const root: HTMLElement = harness.fixture.nativeElement;
    await vi.waitFor(() => expect(root.querySelector('tn-notes-list li[data-id="a"]')).not.toBeNull());
    return { harness, root };
  }

  const textarea = (root: HTMLElement) => root.querySelector('textarea') as HTMLTextAreaElement;

  it('shows the list beside the editor with one panel and one skip target', async () => {
    const { root } = await open('/note/a');

    const list = root.querySelector('section.list');
    expect(list?.getAttribute('aria-label')).toBe('Poznámky');
    expect(list?.querySelector('tn-notes-list')?.classList).toContain('pane');
    expect(root.querySelectorAll('[id="obsah"]')).toHaveLength(1);
    expect(root.querySelector('#obsah')).toBe(list);
    expect(root.querySelectorAll('tn-bottom-nav')).toHaveLength(1);
    await vi.waitFor(() => expect(textarea(root).value).toBe('První'));
  });

  it('keeps the layout and the list and creates a new editor for another note', async () => {
    const { harness, root } = await open('/note/a?tag=x');
    const split = root.querySelector('tn-split');
    const list = root.querySelector('tn-notes-list');
    const editor = root.querySelector('tn-note-editor');
    await vi.waitFor(() => expect(root.querySelector('li[data-id="a"] a.body')?.getAttribute('aria-current')).toBe('page'));
    expect(root.querySelector('li[data-id="a"] .actions')).toBeNull();
    expect(root.querySelector('li[data-id="b"] .actions')).not.toBeNull();
    expect(root.querySelector('li[data-id="b"] a.body')?.getAttribute('href')).toBe('/note/b?tag=x');

    await harness.navigateByUrl('/note/b?tag=x');
    await vi.waitFor(() => expect(textarea(root).value).toBe('Druhá'));

    expect(root.querySelector('tn-split')).toBe(split);
    expect(root.querySelector('tn-notes-list')).toBe(list);
    expect(root.querySelector('tn-note-editor')).not.toBe(editor);
    await vi.waitFor(() => expect(root.querySelector('li[data-id="b"] a.body')?.getAttribute('aria-current')).toBe('page'));
    expect(root.querySelector('li[data-id="a"] a.body')?.hasAttribute('aria-current')).toBe(false);
    expect(root.querySelector('li[data-id="a"] .actions')).not.toBeNull();
  });

  it('removes and returns the list across 1200 px without touching the editor', async () => {
    const { harness, root } = await open('/new');
    const editor = textarea(root);
    editor.focus();
    editor.value = 'Rozepsaný text';
    editor.dispatchEvent(new Event('input'));

    listeners.forEach((listener) => listener({ matches: false }));
    await harness.fixture.whenStable();
    expect(root.querySelector('tn-notes-list, section.list')).toBeNull();
    expect(textarea(root)).toBe(editor);
    expect(document.activeElement).toBe(editor);

    listeners.forEach((listener) => listener({ matches: true }));
    await harness.fixture.whenStable();
    await vi.waitFor(() => expect(root.querySelector('tn-notes-list')).not.toBeNull());
    expect(textarea(root)).toBe(editor);
    expect(editor.value).toBe('Rozepsaný text');
    expect(document.activeElement).toBe(editor);
  });

  it('refreshes the list after a save in the editor and after switching notes', async () => {
    const { harness, root } = await open('/new');
    const titles = () => [...root.querySelectorAll('tn-notes-list .title')].map((title) => title.textContent?.trim());
    const editor = textarea(root);
    editor.value = 'Nová z editoru';
    editor.dispatchEvent(new Event('input'));

    await vi.waitFor(() => expect(titles()).toContain('Nová z editoru'), { timeout: 3000 });

    await harness.navigateByUrl('/note/a');
    await vi.waitFor(() => expect(textarea(root).value).toBe('První'));
    textarea(root).value = 'Přejmenovaná';
    textarea(root).dispatchEvent(new Event('input'));
    await harness.navigateByUrl('/note/b');

    await vi.waitFor(() => expect(titles()).toContain('Přejmenovaná'));
  });

  it('renders only the editor in a narrow window', async () => {
    wide = false;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/note/a');
    const root: HTMLElement = harness.fixture.nativeElement;
    await vi.waitFor(() => expect(textarea(root).value).toBe('První'));

    expect(root.querySelector('tn-notes-list, section.list, tn-bottom-nav')).toBeNull();
  });

  it('closes the editor with Esc back to the list with focus on the note card', async () => {
    const { root } = await open('/note/a?tag=x');
    await vi.waitFor(() => expect(textarea(root).value).toBe('První'));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    textarea(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(navigate).toHaveBeenCalledWith(['/notes'], { queryParamsHandling: 'preserve', state: { focus: 'a' } });
  });
});

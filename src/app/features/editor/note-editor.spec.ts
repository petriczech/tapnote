import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { createNote } from '../../core/model/note';
import { NotesRepository } from '../../core/storage/notes-repository';
import { InMemoryNotesRepository } from '../../core/storage/testing/in-memory-notes-repository';
import { ParamsRouteReuseStrategy } from '../../params-route-reuse-strategy';
import { NoteDraft } from './note-draft';
import { NoteEditor } from './note-editor';

describe('NoteEditor', () => {
  let repository: InMemoryNotesRepository;

  beforeEach(() => {
    repository = new InMemoryNotesRepository();
    TestBed.configureTestingModule({
      imports: [NoteEditor],
      providers: [
        provideRouter([{ path: 'note/:id', component: NoteEditor }], withComponentInputBinding()),
        { provide: RouteReuseStrategy, useClass: ParamsRouteReuseStrategy },
        { provide: NotesRepository, useValue: repository },
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

  function buttonOf(root: HTMLElement, text: string): HTMLButtonElement {
    return [...root.querySelectorAll('button')].find((button) => button.textContent?.trim() === text) as HTMLButtonElement;
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

      expect(navigate).toHaveBeenCalledWith(['/notes']);
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

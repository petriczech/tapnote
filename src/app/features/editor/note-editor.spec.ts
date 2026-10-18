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
});

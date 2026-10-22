import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NoteView } from './note-view';

describe('NoteView', () => {
  let fixture: ComponentFixture<NoteView>;
  let root: HTMLElement;

  async function render(content: string): Promise<void> {
    fixture.componentRef.setInput('content', content);
    await fixture.whenStable();
  }

  function labels(): string[] {
    return [...root.querySelectorAll('label')].map((label) => label.textContent?.trim() ?? '');
  }

  function doneToggle(): HTMLButtonElement | null {
    return root.querySelector('.done-toggle');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'note/:id', children: [] }])] });
    fixture = TestBed.createComponent(NoteView);
    root = fixture.nativeElement;
  });

  it('renders text lines and open items', async () => {
    await render('Nákup\n- [ ] mléko\n- [x] chleba');

    expect(root.querySelector('h1')?.textContent).toBe('Nákup');
    expect(labels()).toEqual(['mléko']);
    expect(doneToggle()?.textContent?.trim()).toBe('Hotové (1)');
  });

  it('expands and collapses done items', async () => {
    await render('- [ ] mléko\n- [x] chleba');

    doneToggle()?.click();
    await fixture.whenStable();
    expect(labels()).toEqual(['mléko', 'chleba']);
    expect(doneToggle()?.getAttribute('aria-expanded')).toBe('true');

    doneToggle()?.click();
    await fixture.whenStable();
    expect(labels()).toEqual(['mléko']);
    expect(doneToggle()?.getAttribute('aria-expanded')).toBe('false');
  });

  it('emits the line of a toggled item', async () => {
    const toggled: number[] = [];
    fixture.componentInstance.itemToggle.subscribe((line) => toggled.push(line));
    await render('Nákup\n- [ ] mléko');

    root.querySelector<HTMLInputElement>('input[type=checkbox]')?.click();

    expect(toggled).toEqual([1]);
  });

  it('shows the state from the content after an item moves', async () => {
    fixture.componentInstance.itemToggle.subscribe(() => render('- [ ] chleba\n- [x] mléko'));
    await render('- [ ] mléko\n- [ ] chleba');

    root.querySelector<HTMLInputElement>('input[type=checkbox]')?.click();
    await vi.waitFor(() => expect(labels()).toEqual(['chleba']));

    expect(root.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(false);
  });

  it('moves focus to the done toggle when the last open item is checked', async () => {
    fixture.componentInstance.itemToggle.subscribe(() => render('- [x] mléko'));
    await render('- [ ] mléko');
    const box = root.querySelector<HTMLInputElement>('input[type=checkbox]');
    box?.focus();

    box?.click();
    await vi.waitFor(() => expect(document.activeElement).toBe(doneToggle()));
  });

  it('keeps focus on the same position when an item moves', async () => {
    fixture.componentInstance.itemToggle.subscribe(() => render('- [ ] chleba\n- [x] mléko'));
    await render('- [ ] mléko\n- [ ] chleba');
    const box = root.querySelector<HTMLInputElement>('input[type=checkbox]');
    box?.focus();

    box?.click();
    await vi.waitFor(() => expect(labels()).toEqual(['chleba']));

    expect(document.activeElement).toBe(root.querySelector('input[type=checkbox]'));
  });

  it('names an item without text', async () => {
    await render('- [ ]');

    expect(root.querySelector('input')?.getAttribute('aria-label')).toBe('Prázdná položka');
  });

  it('shows the first line as the heading and the checklist progress', async () => {
    await render('\n# Víkend\npoznámka\n- [x] klíče\n- [ ] spacák\n- [ ] deky');

    expect(root.querySelector('h1')?.textContent).toBe('Víkend');
    expect([...root.querySelectorAll('.text')].map((text) => text.textContent)).toEqual(['poznámka']);
    const progress = root.querySelector('progress');
    expect([progress?.value, progress?.max]).toEqual([1, 3]);
    expect(root.querySelector(`#${progress?.getAttribute('aria-labelledby')}`)?.textContent).toBe('1 ze 3 splněno');
  });

  it('leaves out the heading when the note starts with an item', async () => {
    await render('- [ ] mléko');

    expect(root.querySelector('h1')).toBeNull();
    expect(labels()).toEqual(['mléko']);
  });

  it('emits the line for a new item after the open items', async () => {
    const lines: { line: number; from: number }[] = [];
    fixture.componentInstance.addItem.subscribe((line) => lines.push(line));
    await render('Nákup\n- [ ] mléko\n- [x] chleba');
    root.querySelector<HTMLButtonElement>('.add-item')?.click();

    await render('Nákup\n- [x] chleba');
    root.querySelector<HTMLButtonElement>('.add-item')?.click();

    expect(lines).toEqual([
      { line: 2, from: 1 },
      { line: 1, from: 1 },
    ]);
  });

  it('leaves out the heading when the first line has no title, like deriveTitle', async () => {
    await render('#\nNákup\n- [ ] mléko');

    expect(root.querySelector('h1')).toBeNull();
    expect([...root.querySelectorAll('.text')].map((text) => text.textContent)).toEqual(['#', 'Nákup']);
  });

  it('hides the done toggle without done items', async () => {
    await render('- [ ] mléko');

    expect(doneToggle()).toBeNull();
  });

  describe('links', () => {
    beforeEach(() => fixture.componentRef.setInput('targets', new Map([['nákup', 'n1']])));

    it('links an existing note and keeps the surrounding text', async () => {
      await render('Viz [[Nákup]] a [[Porada]].');

      const link = root.querySelector<HTMLAnchorElement>('a.link');
      expect(link?.textContent).toBe('Nákup');
      expect(link?.getAttribute('href')).toBe('/note/n1');
      expect(root.querySelector('h1')?.textContent).toBe('Viz Nákup a Porada.');
    });

    it('marks a link to a missing note', async () => {
      await render('[[Porada]]');

      const missing = root.querySelector('.link.missing');
      expect(missing?.textContent).toBe('Porada');
      expect(missing?.getAttribute('title')).toBe('Poznámka zatím neexistuje');
      expect(root.querySelector('a')).toBeNull();
    });

    it('does not toggle an item when its link is clicked', async () => {
      const toggled: number[] = [];
      fixture.componentInstance.itemToggle.subscribe((line) => toggled.push(line));
      await render('- [ ] koupit [[nákup]]');

      root.querySelector<HTMLAnchorElement>('a.link')?.click();
      await fixture.whenStable();

      expect(labels()).toEqual(['koupit nákup']);
      expect(root.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(false);
      expect(toggled).toEqual([]);
    });
  });
});

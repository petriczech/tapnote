import { ComponentFixture, TestBed } from '@angular/core/testing';
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
    fixture = TestBed.createComponent(NoteView);
    root = fixture.nativeElement;
  });

  it('renders text lines and open items', async () => {
    await render('Nákup\n- [ ] mléko\n- [x] chleba');

    expect(root.querySelector('.text')?.textContent).toBe('Nákup');
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

  it('hides the done toggle without done items', async () => {
    await render('- [ ] mléko');

    expect(doneToggle()).toBeNull();
  });
});

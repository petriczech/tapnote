import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SHORTCUTS, SHORTCUTS_KEY } from '../../core/shortcuts/shortcuts';
import { Shortcuts } from './shortcuts';

describe('Shortcuts', () => {
  let fixture: ComponentFixture<Shortcuts>;
  let root: HTMLElement;

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(Shortcuts);
    root = fixture.nativeElement;
    document.body.append(root);
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Shortcuts], providers: [provideRouter([])] });
  });

  afterEach(() => {
    localStorage.removeItem(SHORTCUTS_KEY);
    root.remove();
  });

  it('shows the breadcrumb back to Nastavení, the focused title and Nastavení as the current bottom nav item', async () => {
    await render();

    const crumb = root.querySelector('.crumbs');
    expect(crumb?.textContent?.trim()).toBe('Nastavení');
    expect(crumb?.getAttribute('href')).toBe('/settings');
    const title = root.querySelector('h1');
    expect(title?.textContent?.trim()).toBe('Klávesové zkratky');
    expect(document.activeElement).toBe(title);
    const current = root.querySelector('nav[aria-label="Pohledy"] [aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Nastavení');
  });

  it('turns keyboard shortcuts off and lists them', async () => {
    await render();
    const box = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (input) => input.labels?.[0]?.textContent?.trim() === 'Zapnout klávesové zkratky',
    ) as HTMLInputElement;

    expect(box.checked).toBe(true);
    expect(root.querySelectorAll('.shortcuts tbody tr').length).toBe(SHORTCUTS.length);
    box.click();

    expect(localStorage.getItem(SHORTCUTS_KEY)).toBe('off');
  });
});

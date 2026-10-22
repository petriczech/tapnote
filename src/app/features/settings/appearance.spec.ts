import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AMBIENT_KEY, SCHEME_KEY, THEME_KEY } from '../../core/theme/theme';
import { Appearance } from './appearance';

describe('Appearance', () => {
  let fixture: ComponentFixture<Appearance>;
  let root: HTMLElement;

  const radio = (value: string) => root.querySelector<HTMLInputElement>(`input[value="${value}"]`) as HTMLInputElement;
  const group = (name: string) => [...root.querySelectorAll('fieldset')].find((item) => item.querySelector('legend')?.textContent?.trim() === name);
  const themeRadio = (name: string) =>
    [...(group('Motiv')?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])].find(
      (input) => input.closest('label')?.textContent?.trim() === name,
    ) as HTMLInputElement;
  const ambientSwitch = () => root.querySelector<HTMLInputElement>('input[role="switch"]');

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(Appearance);
    root = fixture.nativeElement;
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Appearance], providers: [provideRouter([])] });
  });

  afterEach(() => {
    localStorage.removeItem(THEME_KEY);
    localStorage.removeItem(AMBIENT_KEY);
    localStorage.removeItem(SCHEME_KEY);
    delete document.documentElement.dataset['theme'];
    delete document.documentElement.dataset['ambient'];
    delete document.documentElement.dataset['scheme'];
  });

  it('shows the breadcrumb back to Nastavení, the title and Nastavení as the current bottom nav item', async () => {
    await render();

    const crumb = root.querySelector('.crumbs');
    expect(crumb?.textContent?.trim()).toBe('Nastavení');
    expect(crumb?.getAttribute('href')).toBe('/settings');
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Vzhled');
    const current = root.querySelector('nav[aria-label="Pohledy"] [aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Nastavení');
  });

  it('shows the sample task row hidden from assistive technology', async () => {
    await render();

    expect(root.querySelector('.sample')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.sample')?.querySelector('a, button, input, [tabindex]')).toBeNull();
    expect(root.querySelector('.section-h')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('switches the theme', async () => {
    await render();
    expect(radio('noir').checked).toBe(true);

    radio('graphite').click();
    await fixture.whenStable();

    expect(document.documentElement.dataset['theme']).toBe('graphite');
    expect(localStorage.getItem(THEME_KEY)).toBe('graphite');
    expect(radio('graphite').checked).toBe(true);

    radio('noir').click();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('offers five theme tiles with a check badge on the selected one', async () => {
    await render();

    const names = [...(group('Motiv')?.querySelectorAll('label') ?? [])].map((label) => label.textContent?.trim());
    expect(names).toEqual(['Noir', 'Modrá', 'Papír', 'Grafit', 'Bílá']);
    expect(themeRadio('Noir').checked).toBe(true);
    expect(themeRadio('Noir').closest('label')?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(themeRadio('Bílá').closest('label')?.querySelector('svg')).toBeNull();

    themeRadio('Bílá').click();
    await fixture.whenStable();

    expect(document.documentElement.dataset['theme']).toBe('white');
    expect(themeRadio('Bílá').closest('label')?.querySelector('svg')).not.toBeNull();
    expect(themeRadio('Noir').closest('label')?.querySelector('svg')).toBeNull();
  });

  it('shows a stored airy theme as Modrá', async () => {
    localStorage.setItem(THEME_KEY, 'airy');
    await render();

    expect(themeRadio('Modrá').checked).toBe(true);
  });

  it('switches the ambient glow off and on in Noir only', async () => {
    await render();
    const toggle = ambientSwitch() as HTMLInputElement;
    expect(toggle.labels?.[0]?.textContent?.trim()).toBe('Ambientní přechody');
    expect(root.querySelector(`#${toggle.getAttribute('aria-describedby')}`)?.textContent?.trim()).toBe('Barevná záře za skleněnými panely');
    expect(toggle.checked).toBe(true);

    toggle.click();
    await fixture.whenStable();

    expect(document.documentElement.dataset['ambient']).toBe('off');
    expect(localStorage.getItem(AMBIENT_KEY)).toBe('off');
    expect(toggle.checked).toBe(false);

    toggle.click();
    await fixture.whenStable();

    expect(document.documentElement.hasAttribute('data-ambient')).toBe(false);

    themeRadio('Papír').click();
    await fixture.whenStable();

    expect(ambientSwitch()).toBeNull();
  });

  it('switches the scheme in the Režim group', async () => {
    await render();
    const labels = [...(group('Režim')?.querySelectorAll('label') ?? [])].map((label) => label.textContent?.trim());
    expect(labels).toEqual(['Světlý', 'Tmavý', 'Systém']);
    expect(radio('system').checked).toBe(true);

    radio('dark').click();
    await fixture.whenStable();

    expect(document.documentElement.dataset['scheme']).toBe('dark');
    expect(localStorage.getItem(SCHEME_KEY)).toBe('dark');
    expect(radio('dark').checked).toBe(true);

    radio('system').click();
    await fixture.whenStable();

    expect(document.documentElement.hasAttribute('data-scheme')).toBe(false);
    expect(radio('system').checked).toBe(true);
  });
});

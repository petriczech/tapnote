import { applyTheme, readTheme, THEME_KEY } from './theme';

describe('theme', () => {
  afterEach(() => {
    localStorage.removeItem(THEME_KEY);
    delete document.documentElement.dataset['theme'];
  });

  it('defaults to konfety', () => {
    expect(readTheme()).toBe('konfety');

    localStorage.setItem(THEME_KEY, 'neon');
    expect(readTheme()).toBe('konfety');
  });

  it('applies and remembers a theme', () => {
    applyTheme('paper');

    expect(document.documentElement.dataset['theme']).toBe('paper');
    expect(readTheme()).toBe('paper');
  });

  it('uses no attribute for konfety', () => {
    applyTheme('white');
    applyTheme('konfety');

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('konfety');
  });

  it('applies blue as an attribute', () => {
    applyTheme('blue');

    expect(document.documentElement.dataset['theme']).toBe('blue');
  });
});

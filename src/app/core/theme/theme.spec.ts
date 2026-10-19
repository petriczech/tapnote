import { applyTheme, readTheme, THEME_KEY } from './theme';

describe('theme', () => {
  afterEach(() => {
    localStorage.removeItem(THEME_KEY);
    delete document.documentElement.dataset['theme'];
  });

  it('defaults to blue', () => {
    expect(readTheme()).toBe('blue');

    localStorage.setItem(THEME_KEY, 'neon');
    expect(readTheme()).toBe('blue');
  });

  it('applies and remembers a theme', () => {
    applyTheme('paper');

    expect(document.documentElement.dataset['theme']).toBe('paper');
    expect(readTheme()).toBe('paper');
  });

  it('uses no attribute for blue', () => {
    applyTheme('graphite');
    applyTheme('blue');

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('blue');
  });
});

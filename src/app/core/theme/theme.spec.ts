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

  it('sets the status bar colours of the theme', () => {
    const metas = ['light', 'dark'].map((scheme) => {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.setAttribute('media', `(prefers-color-scheme: ${scheme})`);
      document.head.append(meta);
      return meta;
    });
    onTestFinished(() => metas.forEach((meta) => meta.remove()));

    applyTheme('paper');
    expect(metas.map((meta) => meta.content)).toEqual(['#f7f1e3', '#1d1a16']);

    applyTheme('konfety');
    expect(metas.map((meta) => meta.content)).toEqual(['#fff8f1', '#17121f']);
  });

  it('applies blue as an attribute', () => {
    applyTheme('blue');

    expect(document.documentElement.dataset['theme']).toBe('blue');
  });
});

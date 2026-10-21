import { AMBIENT_KEY, applyAmbient, applyScheme, applyTheme, readAmbient, readScheme, readTheme, SCHEME_KEY, THEME_KEY } from './theme';

describe('theme', () => {
  afterEach(() => {
    localStorage.removeItem(THEME_KEY);
    localStorage.removeItem(SCHEME_KEY);
    localStorage.removeItem(AMBIENT_KEY);
    delete document.documentElement.dataset['theme'];
    delete document.documentElement.dataset['scheme'];
    delete document.documentElement.dataset['ambient'];
  });

  it('defaults to noir', () => {
    expect(readTheme()).toBe('noir');

    localStorage.setItem(THEME_KEY, 'neon');
    expect(readTheme()).toBe('noir');
  });

  it('maps the removed konfety theme to noir', () => {
    localStorage.setItem(THEME_KEY, 'konfety');

    expect(readTheme()).toBe('noir');
  });

  it('maps the removed airy theme to blue and notebook to paper', () => {
    localStorage.setItem(THEME_KEY, 'airy');
    expect(readTheme()).toBe('blue');

    localStorage.setItem(THEME_KEY, 'notebook');
    expect(readTheme()).toBe('paper');
  });

  it('keeps the ambient glow on by default', () => {
    expect(readAmbient()).toBe(true);

    localStorage.setItem(AMBIENT_KEY, 'nonsense');
    expect(readAmbient()).toBe(true);
  });

  it('turns the ambient glow off with an attribute and remembers it', () => {
    applyAmbient(false);

    expect(document.documentElement.dataset['ambient']).toBe('off');
    expect(readAmbient()).toBe(false);

    applyAmbient(true);

    expect(document.documentElement.hasAttribute('data-ambient')).toBe(false);
    expect(localStorage.getItem(AMBIENT_KEY)).toBe('on');
    expect(readAmbient()).toBe(true);
  });

  it('applies and remembers a theme', () => {
    applyTheme('paper');

    expect(document.documentElement.dataset['theme']).toBe('paper');
    expect(readTheme()).toBe('paper');
  });

  it('uses no attribute for noir', () => {
    applyTheme('white');
    applyTheme('noir');

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('noir');
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

    applyTheme('noir');
    expect(metas.map((meta) => meta.content)).toEqual(['#f6f6fa', '#0b0b10']);
  });

  it('applies blue as an attribute', () => {
    applyTheme('blue');

    expect(document.documentElement.dataset['theme']).toBe('blue');
  });

  it('defaults to the system scheme', () => {
    expect(readScheme()).toBe('system');

    localStorage.setItem(SCHEME_KEY, 'sepia');
    expect(readScheme()).toBe('system');
  });

  it('applies and remembers a forced scheme', () => {
    applyScheme('dark');

    expect(document.documentElement.dataset['scheme']).toBe('dark');
    expect(readScheme()).toBe('dark');

    applyScheme('system');

    expect(document.documentElement.hasAttribute('data-scheme')).toBe(false);
    expect(localStorage.getItem(SCHEME_KEY)).toBe('system');
  });

  it('gives both status bar colours to a forced scheme', () => {
    const metas = ['light', 'dark'].map((scheme) => {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.setAttribute('media', `(prefers-color-scheme: ${scheme})`);
      document.head.append(meta);
      return meta;
    });
    onTestFinished(() => metas.forEach((meta) => meta.remove()));

    applyScheme('dark');
    expect(metas.map((meta) => meta.content)).toEqual(['#0b0b10', '#0b0b10']);

    applyTheme('paper');
    expect(metas.map((meta) => meta.content)).toEqual(['#1d1a16', '#1d1a16']);

    applyScheme('light');
    expect(metas.map((meta) => meta.content)).toEqual(['#f7f1e3', '#f7f1e3']);

    applyScheme('system');
    expect(metas.map((meta) => meta.content)).toEqual(['#f7f1e3', '#1d1a16']);
  });
});

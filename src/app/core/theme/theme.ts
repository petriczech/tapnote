// Vzhled aplikace; při startu ho před vykreslením nastavuje i skript v index.html (stejný klíč a hodnoty)
export const THEME_KEY = 'tapnote.theme';

// Náhled: pozadí, karta, akcent (světlá varianta)
// Stavový řádek (theme-color): pozadí světlé a tmavé varianty; stejné hodnoty má skript v index.html
export const THEMES = [
  { id: 'konfety', label: 'Konfety', preview: ['#fff8f1', '#ffffff', '#5b2ee8'], bar: ['#fff8f1', '#17121f'] },
  { id: 'blue', label: 'Modrá', preview: ['#fbf9ff', '#ffffff', '#1a56b8'], bar: ['#fbf9ff', '#121318'] },
  { id: 'paper', label: 'Papír', preview: ['#f7f1e3', '#fffaf0', '#b4441c'], bar: ['#f7f1e3', '#1d1a16'] },
  { id: 'graphite', label: 'Grafit', preview: ['#f0f0f0', '#ffffff', '#0d7a5f'], bar: ['#ffffff', '#0b0b0b'] },
  { id: 'white', label: 'Bílá', preview: ['#ffffff', '#f4f4f5', '#5b2ee8'], bar: ['#ffffff', '#0f0f11'] },
  { id: 'airy', label: 'Vzdušná', preview: ['#f7f8fb', '#ffffff', '#2457c5'], bar: ['#f7f8fb', '#111318'] },
  { id: 'notebook', label: 'Zápisník', preview: ['#f5f0e6', '#fbf8f1', '#a3301a'], bar: ['#f5f0e6', '#1c1a17'] },
  { id: 'noir', label: 'Noir', preview: ['#f6f6fa', '#ffffff', '#5a32e0'], bar: ['#f6f6fa', '#0b0b10'] },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function readTheme(): ThemeId {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return isThemeId(value) ? value : 'konfety';
  } catch {
    return 'konfety';
  }
}

// Konfety jsou výchozí vzhled bez atributu
export function applyTheme(theme: ThemeId): void {
  if (theme === 'konfety') {
    delete document.documentElement.dataset['theme'];
  } else {
    document.documentElement.dataset['theme'] = theme;
  }
  const bar = THEMES.find((item) => item.id === theme)?.bar ?? THEMES[0].bar;
  document.querySelector('meta[name="theme-color"][media*="light"]')?.setAttribute('content', bar[0]);
  document.querySelector('meta[name="theme-color"][media*="dark"]')?.setAttribute('content', bar[1]);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Bez úložiště platí vzhled jen do zavření
  }
}

// Vzhled aplikace; při startu ho před vykreslením nastavuje i skript v index.html (stejný klíč a hodnoty)
export const THEME_KEY = 'tapnote.theme';

// Náhled: pozadí, karta, akcent (světlá varianta)
// Stavový řádek (theme-color): pozadí světlé a tmavé varianty; stejné hodnoty má skript v index.html
export const THEMES = [
  { id: 'noir', label: 'Noir', preview: ['#f6f6fa', '#ffffff', '#5a32e0'], bar: ['#f6f6fa', '#0b0b10'] },
  { id: 'blue', label: 'Modrá', preview: ['#fbf9ff', '#ffffff', '#1a56b8'], bar: ['#fbf9ff', '#121318'] },
  { id: 'paper', label: 'Papír', preview: ['#f7f1e3', '#fffaf0', '#b4441c'], bar: ['#f7f1e3', '#1d1a16'] },
  { id: 'graphite', label: 'Grafit', preview: ['#f0f0f0', '#ffffff', '#0d7a5f'], bar: ['#ffffff', '#0b0b0b'] },
  { id: 'white', label: 'Bílá', preview: ['#ffffff', '#f4f4f5', '#111111'], bar: ['#ffffff', '#0f0f11'] },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

// Režim; Systém je výchozí bez atributu, rozhoduje media query
export const SCHEME_KEY = 'tapnote.scheme';

export const SCHEMES = [
  { id: 'light', label: 'Světlý' },
  { id: 'dark', label: 'Tmavý' },
  { id: 'system', label: 'Systém' },
] as const;

export type SchemeId = (typeof SCHEMES)[number]['id'];

function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

// Zrušená Vzdušná vede na Modrou a Zápisník na Papír (stejně ve skriptu v index.html); zrušené Konfety i neznámá hodnota na výchozí Noir
export function readTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    const value = stored === 'airy' ? 'blue' : stored === 'notebook' ? 'paper' : stored;
    return isThemeId(value) ? value : 'noir';
  } catch {
    return 'noir';
  }
}

// Noir je výchozí vzhled bez atributu
export function applyTheme(theme: ThemeId): void {
  if (theme === 'noir') {
    delete document.documentElement.dataset['theme'];
  } else {
    document.documentElement.dataset['theme'] = theme;
  }
  applyBars();
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Bez úložiště platí vzhled jen do zavření
  }
}

// Ambientní záře Noiru; výchozí zapnutá bez atributu, vypnutá jako data-ambient="off" (stejně ve skriptu v index.html)
export const AMBIENT_KEY = 'tapnote.ambient';

export function readAmbient(): boolean {
  try {
    return localStorage.getItem(AMBIENT_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function applyAmbient(on: boolean): void {
  if (on) {
    delete document.documentElement.dataset['ambient'];
  } else {
    document.documentElement.dataset['ambient'] = 'off';
  }
  try {
    localStorage.setItem(AMBIENT_KEY, on ? 'on' : 'off');
  } catch {
    // Bez úložiště platí volba jen do zavření
  }
}

export function readScheme(): SchemeId {
  try {
    const value = localStorage.getItem(SCHEME_KEY);
    return SCHEMES.find((scheme) => scheme.id === value)?.id ?? 'system';
  } catch {
    return 'system';
  }
}

export function applyScheme(scheme: SchemeId): void {
  if (scheme === 'system') {
    delete document.documentElement.dataset['scheme'];
  } else {
    document.documentElement.dataset['scheme'] = scheme;
  }
  applyBars();
  try {
    localStorage.setItem(SCHEME_KEY, scheme);
  } catch {
    // Bez úložiště platí režim jen do zavření
  }
}

// Stavový řádek podle vzhledu a režimu na <html>; vynucený režim dává oběma metám svou barvu
function applyBars(): void {
  const { theme, scheme } = document.documentElement.dataset;
  const bar = THEMES.find((item) => item.id === theme)?.bar ?? THEMES[0].bar;
  const index = scheme === 'light' ? 0 : scheme === 'dark' ? 1 : undefined;
  document.querySelector('meta[name="theme-color"][media*="light"]')?.setAttribute('content', bar[index ?? 0]);
  document.querySelector('meta[name="theme-color"][media*="dark"]')?.setAttribute('content', bar[index ?? 1]);
}

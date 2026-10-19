import { expandTemplate } from './template';

// Pondělí 19. 10. 2026 9:05 místního času
const NOW = new Date(2026, 9, 19, 9, 5);

describe('expandTemplate', () => {
  it('fills in the date, time and weekday in Czech', () => {
    expect(expandTemplate('Deník {{weekday}} {{date}} v {{time}}', NOW).content).toBe('Deník pondělí 19. 10. 2026 v 09:05');
  });

  it('places the cursor at the first marker and removes all markers', () => {
    const expanded = expandTemplate('# Porada\nÚčastníci: {{cursor}}\nZávěry: {{cursor}}', NOW);

    expect(expanded.content).toBe('# Porada\nÚčastníci: \nZávěry: ');
    expect(expanded.cursor).toBe('# Porada\nÚčastníci: '.length);
  });

  it('puts the cursor after expanded variables', () => {
    const expanded = expandTemplate('{{date}} {{cursor}}', NOW);

    expect(expanded.cursor).toBe('19. 10. 2026 '.length);
  });

  it('puts the cursor at the end without a marker', () => {
    expect(expandTemplate('Nákup\n- [ ] ', NOW)).toEqual({ content: 'Nákup\n- [ ] ', cursor: 12 });
  });

  it('keeps unknown variables', () => {
    expect(expandTemplate('{{name}}', NOW).content).toBe('{{name}}');
  });
});

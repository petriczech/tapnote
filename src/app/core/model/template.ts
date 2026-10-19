const CURSOR = '{{cursor}}';

export interface ExpandedTemplate {
  content: string;
  // Pozice kurzoru: první {{cursor}}, jinak konec textu
  cursor: number;
}

// Datum a čas česky, {{cursor}} se odstraní
export function expandTemplate(template: string, now: Date): ExpandedTemplate {
  const text = template
    .replaceAll('{{date}}', now.toLocaleDateString('cs-CZ'))
    .replaceAll('{{time}}', now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }))
    .replaceAll('{{weekday}}', now.toLocaleDateString('cs-CZ', { weekday: 'long' }));
  const index = text.indexOf(CURSOR);
  const content = text.replaceAll(CURSOR, '');
  return { content, cursor: index === -1 ? content.length : index };
}

// Položka checklistu: odsazení, odrážka, [ ] nebo [x], text
const ITEM = /^(\s*)([-*+]) \[([ xX])\](?: (.*))?$/;
const PREFIX = '- [ ] ';

export interface ChecklistRow {
  line: number;
  level: number;
  checked: boolean;
  text: string;
}

export type NoteSegment =
  | { kind: 'text'; line: number; text: string }
  | { kind: 'checklist'; open: ChecklistRow[]; done: ChecklistRow[]; doneCount: number };

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
  cursor: number;
}

interface ParsedItem {
  indent: string;
  bullet: string;
  checked: boolean;
  text: string;
}

type Range = [start: number, end: number];

function parseItem(line: string): ParsedItem | undefined {
  const match = ITEM.exec(line);
  return match ? { indent: match[1], bullet: match[2], checked: match[3] !== ' ', text: match[4] ?? '' } : undefined;
}

function indentOf(line: string): number {
  return /^\s*/.exec(line)?.[0].length ?? 0;
}

// Souvislý blok položek kolem řádku
function blockAround(lines: string[], line: number): Range {
  let start = line;
  let end = line + 1;
  while (start > 0 && ITEM.test(lines[start - 1])) {
    start--;
  }
  while (end < lines.length && ITEM.test(lines[end])) {
    end++;
  }
  return [start, end];
}

// Položky nejvyšší úrovně bloku i s podpoložkami
function groupsOf(lines: string[], [start, end]: Range): Range[] {
  const min = Math.min(...lines.slice(start, end).map(indentOf));
  const groups: Range[] = [];
  for (let i = start; i < end; i++) {
    if (i === start || indentOf(lines[i]) <= min) {
      groups.push([i, i + 1]);
    } else {
      groups[groups.length - 1][1] = i + 1;
    }
  }
  return groups;
}

function lineBounds(value: string, cursor: number): Range {
  const start = cursor === 0 ? 0 : value.lastIndexOf('\n', cursor - 1) + 1;
  const end = value.indexOf('\n', cursor);
  return [start, end === -1 ? value.length : end];
}

export function hasChecklist(content: string): boolean {
  return content.split('\n').some((line) => ITEM.test(line));
}

export function parseSegments(content: string): NoteSegment[] {
  const lines = content.split('\n');
  const segments: NoteSegment[] = [];
  let line = 0;
  while (line < lines.length) {
    if (!ITEM.test(lines[line])) {
      segments.push({ kind: 'text', line, text: lines[line] });
      line++;
      continue;
    }
    const block = blockAround(lines, line);
    const min = Math.min(...lines.slice(block[0], block[1]).map(indentOf));
    const segment: NoteSegment = { kind: 'checklist', open: [], done: [], doneCount: 0 };
    for (const [start, end] of groupsOf(lines, block)) {
      const rows = lines.slice(start, end).map((text, i) => {
        const item = parseItem(text) as ParsedItem;
        const level = Math.floor((item.indent.length - min) / 2);
        return { line: start + i, level, checked: item.checked, text: item.text };
      });
      if (rows[0].checked) {
        segment.done.push(...rows);
        segment.doneCount++;
      } else {
        segment.open.push(...rows);
      }
    }
    segments.push(segment);
    line = block[1];
  }
  return segments;
}

// Zaškrtnutá položka jde na konec bloku, odškrtnutá za poslední nezaškrtnutou
export function toggleItem(content: string, line: number): string {
  const lines = content.split('\n');
  const item = parseItem(lines[line] ?? '');
  if (!item) {
    return content;
  }
  const checked = !item.checked;
  lines[line] = lines[line].replace(/\[[ xX]\]/, checked ? '[x]' : '[ ]');

  const block = blockAround(lines, line);
  const ranges = groupsOf(lines, block);
  const groups = ranges.map(([start, end]) => lines.slice(start, end));
  const index = ranges.findIndex(([start]) => start === line);
  if (index === -1) {
    return lines.join('\n');
  }
  const [moved] = groups.splice(index, 1);
  const position = checked
    ? groups.length
    : groups.reduce((last, group, i) => (parseItem(group[0])?.checked ? last : i + 1), 0);
  groups.splice(position, 0, moved);
  lines.splice(block[0], block[1] - block[0], ...groups.flat());
  return lines.join('\n');
}

// Enter na položce: nová položka, na prázdné položce konec seznamu
export function continueList(value: string, cursor: number): TextEdit | undefined {
  const [start, end] = lineBounds(value, cursor);
  const item = parseItem(value.slice(start, end));
  if (!item || cursor - start < item.indent.length + (item.text ? PREFIX.length : PREFIX.length - 1)) {
    return undefined;
  }
  if (item.text.trim() === '') {
    return { from: start, to: end, insert: '', cursor: start };
  }
  const insert = `\n${item.indent}${item.bullet} [ ] `;
  return { from: cursor, to: cursor, insert, cursor: cursor + insert.length };
}

// Přidání nebo odebrání „- [ ] “ na aktuálním řádku
export function toggleItemPrefix(value: string, cursor: number): TextEdit {
  const [start, end] = lineBounds(value, cursor);
  const line = value.slice(start, end);
  const item = parseItem(line);
  const from = start + indentOf(line);
  if (!item) {
    return { from, to: from, insert: PREFIX, cursor: cursor < from ? cursor : cursor + PREFIX.length };
  }
  const to = Math.min(from + PREFIX.length, end);
  return { from, to, insert: '', cursor: cursor <= from ? cursor : Math.max(from, cursor - (to - from)) };
}

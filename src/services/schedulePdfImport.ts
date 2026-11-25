import { inflate } from 'pako';
import type { DayOfWeek } from '../types';

export interface ParsedScheduleClass {
  dayOfWeek: DayOfWeek;
  period: number;
  name: string;
  building: string;
  room: string;
}

interface PdfObject {
  dictionary: string;
  stream?: Uint8Array;
}

interface PositionedText {
  str: string;
  x: number;
  y: number;
}

type Matrix = [number, number, number, number, number, number];

const dayLabels: Record<string, DayOfWeek> = {
  даваа: 'monday',
  мягмар: 'tuesday',
  лхагва: 'wednesday',
  пүрэв: 'thursday',
  баасан: 'friday',
  бямба: 'saturday',
  ням: 'sunday',
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday',
  saturday: 'saturday',
  sunday: 'sunday',
};

const rowTolerance = 10.5;

export function parseSchedulePdf(data: Uint8Array): ParsedScheduleClass[] {
  const objects = readObjects(data);
  const pages = [...objects.entries()].filter(([, object]) =>
    /\/Type\s*\/Page\b/.test(object.dictionary),
  );
  const classes: ParsedScheduleClass[] = [];

  for (const [, page] of pages) {
    const fonts = readFonts(page.dictionary, objects);
    for (const contentId of readContentReferences(page.dictionary)) {
      const content = objects.get(contentId)?.stream;
      if (!content) {
        continue;
      }

      const items = readTextItems(bytesToLatin1(content), fonts);
      classes.push(...parseRows(items));
    }
  }

  if (classes.length === 0) {
    throw new Error('No schedule rows were found in the PDF.');
  }
  return classes;
}

function readObjects(data: Uint8Array): Map<string, PdfObject> {
  const source = bytesToLatin1(data);
  const objects = new Map<string, PdfObject>();
  const header = /(?:^|[\r\n])(\d+)\s+(\d+)\s+obj\b/g;
  let match: RegExpExecArray | null;

  while ((match = header.exec(source))) {
    const key = `${match[1]} ${match[2]}`;
    const bodyStart = header.lastIndex;
    const streamMatch = /\bstream\r?\n/.exec(source.slice(bodyStart));
    const objectEnd = source.indexOf('endobj', bodyStart);

    if (!streamMatch || (objectEnd >= 0 && bodyStart + streamMatch.index > objectEnd)) {
      if (objectEnd < 0) {
        break;
      }
      objects.set(key, {
        dictionary: source.slice(bodyStart, objectEnd),
      });
      header.lastIndex = objectEnd + 'endobj'.length;
      continue;
    }

    const streamTokenStart = bodyStart + streamMatch.index;
    const streamDataStart = bodyStart + streamMatch.index + streamMatch[0].length;
    const dictionary = source.slice(bodyStart, streamTokenStart);
    const declaredLength = dictionary.match(/\/Length\s+(\d+)\b/);
    const streamDataEnd = declaredLength
      ? streamDataStart + Number(declaredLength[1])
      : source.indexOf('endstream', streamDataStart);
    const endStream = source.indexOf('endstream', streamDataEnd);
    const endObject = source.indexOf('endobj', endStream);

    if (
      streamDataEnd < streamDataStart ||
      endStream < 0 ||
      endObject < 0
    ) {
      throw new Error('The PDF has an invalid stream.');
    }

    let stream = latin1ToBytes(source.slice(streamDataStart, streamDataEnd));
    if (/\/FlateDecode\b/.test(dictionary)) {
      stream = inflate(stream);
    }
    objects.set(key, { dictionary, stream });
    header.lastIndex = endObject + 'endobj'.length;
  }

  if (objects.size === 0) {
    throw new Error('The PDF could not be read.');
  }
  return objects;
}

function readFonts(
  pageDictionary: string,
  objects: Map<string, PdfObject>,
): Map<string, Map<number, string>> {
  const resourcesReference = pageDictionary.match(
    /\/Resources\s+(\d+)\s+(\d+)\s+R/,
  );
  const resources =
    resourcesReference &&
    objects.get(`${resourcesReference[1]} ${resourcesReference[2]}`)?.dictionary;
  const fontDictionary =
    (resources ?? pageDictionary).match(/\/Font\s*<<([\s\S]*?)>>/)?.[1] ?? '';
  const fontReferences = [
    ...fontDictionary.matchAll(/\/([\w-]+)\s+(\d+)\s+(\d+)\s+R/g),
  ];
  const fonts = new Map<string, Map<number, string>>();

  for (const reference of fontReferences) {
    const font = objects.get(`${reference[2]} ${reference[3]}`);
    const unicodeReference = font?.dictionary.match(
      /\/ToUnicode\s+(\d+)\s+(\d+)\s+R/,
    );
    const unicodeMap =
      unicodeReference &&
      objects.get(`${unicodeReference[1]} ${unicodeReference[2]}`)?.stream;
    if (unicodeMap) {
      fonts.set(reference[1], parseUnicodeMap(bytesToLatin1(unicodeMap)));
    }
  }
  return fonts;
}

function readContentReferences(pageDictionary: string): string[] {
  const contentsArray = pageDictionary.match(/\/Contents\s*\[([^\]]*)\]/);
  const contents = contentsArray
    ? contentsArray[1]
    : pageDictionary.match(/\/Contents\s+(\d+\s+\d+\s+R)/)?.[1] ?? '';
  return [...contents.matchAll(/(\d+)\s+(\d+)\s+R/g)].map(
    (reference) => `${reference[1]} ${reference[2]}`,
  );
}

function parseUnicodeMap(source: string): Map<number, string> {
  const map = new Map<number, string>();

  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const entry of block[1].matchAll(/<([0-9A-F]+)>\s*<([0-9A-F]+)>/gi)) {
      map.set(Number.parseInt(entry[1], 16), decodeUnicodeHex(entry[2]));
    }
  }

  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const entry of block[1].matchAll(
      /<([0-9A-F]+)>\s*<([0-9A-F]+)>\s*(<([0-9A-F]+)>|\[([\s\S]*?)\])/gi,
    )) {
      const start = Number.parseInt(entry[1], 16);
      const end = Number.parseInt(entry[2], 16);
      const arrayEntries = entry[5]
        ? [...entry[5].matchAll(/<([0-9A-F]+)>/gi)].map((item) =>
            decodeUnicodeHex(item[1]),
          )
        : null;
      const destination = entry[4]
        ? Number.parseInt(entry[4], 16)
        : null;

      for (let code = start; code <= end; code += 1) {
        const value = arrayEntries
          ? arrayEntries[code - start]
          : destination === null
            ? undefined
            : String.fromCodePoint(destination + code - start);
        if (value) {
          map.set(code, value);
        }
      }
    }
  }
  return map;
}

function decodeUnicodeHex(hex: string): string {
  let result = '';
  for (let index = 0; index + 3 < hex.length; index += 4) {
    result += String.fromCharCode(Number.parseInt(hex.slice(index, index + 4), 16));
  }
  return result;
}

function readTextItems(
  content: string,
  fonts: Map<string, Map<number, string>>,
): PositionedText[] {
  const items: PositionedText[] = [];
  const graphicsStack: Matrix[] = [];
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const number = '([-+]?(?:\\d+\\.?\\d*|\\.\\d+))';
  const operators = new RegExp(
    `(?:^|\\s)(q|Q)\\b|(?:^|\\s)${number}\\s+${number}\\s+${number}\\s+${number}\\s+${number}\\s+${number}\\s+cm\\b|(?:^|\\s)BT\\b([\\s\\S]*?)ET\\b`,
    'g',
  );
  let operator: RegExpExecArray | null;

  while ((operator = operators.exec(content))) {
    if (operator[1] === 'q') {
      graphicsStack.push([...matrix]);
    } else if (operator[1] === 'Q') {
      matrix = graphicsStack.pop() ?? matrix;
    } else if (operator[2] !== undefined) {
      matrix = multiplyMatrices(matrix, [
        Number(operator[2]),
        Number(operator[3]),
        Number(operator[4]),
        Number(operator[5]),
        Number(operator[6]),
        Number(operator[7]),
      ]);
    } else if (operator[8] !== undefined) {
      items.push(...readTextBlock(operator[8], matrix, fonts));
    }
  }
  return items;
}

function readTextBlock(
  block: string,
  matrix: Matrix,
  fonts: Map<string, Map<number, string>>,
): PositionedText[] {
  const items: PositionedText[] = [];
  const textMatrixPattern =
    /([-+]?(?:\d+\.?\d*|\.\d+))\s+([-+]?(?:\d+\.?\d*|\.\d+))\s+([-+]?(?:\d+\.?\d*|\.\d+))\s+([-+]?(?:\d+\.?\d*|\.\d+))\s+([-+]?(?:\d+\.?\d*|\.\d+))\s+([-+]?(?:\d+\.?\d*|\.\d+))\s+Tm\b/g;
  const matrices = [...block.matchAll(textMatrixPattern)];

  for (let index = 0; index < matrices.length; index += 1) {
    const textMatrix = matrices[index];
    const segmentStart = textMatrix.index! + textMatrix[0].length;
    const segmentEnd =
      index + 1 < matrices.length ? matrices[index + 1].index! : block.length;
    const segment = block.slice(segmentStart, segmentEnd);
    const fontReferences = [
      ...block
        .slice(0, textMatrix.index)
        .matchAll(/\/([\w-]+)\s+[-+]?(?:\d+\.?\d*|\.\d+)\s+Tf\b/g),
    ];
    const fontName = fontReferences.at(-1)?.[1] ?? '';
    const map = fonts.get(fontName);
    const str = readTextOperators(segment, map);
    if (!str.trim()) {
      continue;
    }

    const textX = Number(textMatrix[5]);
    const textY = Number(textMatrix[6]);
    items.push({
      str,
      x: matrix[0] * textX + matrix[2] * textY + matrix[4],
      y: matrix[1] * textX + matrix[3] * textY + matrix[5],
    });
  }
  return items;
}

function readTextOperators(
  segment: string,
  map?: Map<number, string>,
): string {
  const textOperators =
    /<([0-9A-F]+)>\s*Tj\b|\(((?:\\.|[^\\)])*)\)\s*Tj\b|\[((?:\s*(?:<[0-9A-F]+>|\((?:\\.|[^\\)])*\)|[-+]?(?:\d+\.?\d*|\.\d+))\s*)*)\]\s*TJ\b/gi;
  let text = '';
  let operator: RegExpExecArray | null;

  while ((operator = textOperators.exec(segment))) {
    if (operator[1]) {
      text += decodePdfHex(operator[1], map);
    } else if (operator[2] !== undefined) {
      text += decodeLiteral(operator[2]);
    } else if (operator[3]) {
      for (const value of operator[3].matchAll(/<([0-9A-F]+)>|\(((?:\\.|[^\\)])*)\)/gi)) {
        text += value[1]
          ? decodePdfHex(value[1], map)
          : decodeLiteral(value[2] ?? '');
      }
    }
  }
  return text;
}

function decodePdfHex(hex: string, map?: Map<number, string>): string {
  let value = '';
  const width = map ? 4 : 2;
  for (let index = 0; index + width - 1 < hex.length; index += width) {
    const code = Number.parseInt(hex.slice(index, index + width), 16);
    value += map?.get(code) ?? String.fromCharCode(code);
  }
  return value;
}

function decodeLiteral(value: string): string {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, escaped: string) => {
      const replacements: Record<string, string> = {
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
      };
      return replacements[escaped] ?? escaped;
    })
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) =>
      String.fromCharCode(Number.parseInt(octal, 8)),
    );
}

function parseRows(items: PositionedText[]): ParsedScheduleClass[] {
  const rowAnchors = new Map<number, DayOfWeek>();
  for (const item of items) {
    const day = dayLabels[item.str.trim().toLowerCase()];
    if (day && item.x >= 40 && item.x < 97) {
      rowAnchors.set(item.y, day);
    }
  }

  const rows = [...rowAnchors.entries()].sort(
    ([firstY], [secondY]) => secondY - firstY,
  );
  return rows.map(([rowY, dayOfWeek]) => {
    const rowItems = items.filter(
      (item) => Math.abs(item.y - rowY) <= rowTolerance && item.str.trim(),
    );
    const periodItem = rowItems.find(
      (item) =>
        item.x >= 90 && item.x < 115 && /^\d+$/.test(item.str.trim()),
    );
    const name = joinCell(
      rowItems.filter((item) => item.x >= 150 && item.x < 267),
    );
    const roomText = joinCell(
      rowItems.filter((item) => item.x >= 285 && item.x < 330),
    );
    const roomMatch = roomText.match(
      /([A-Za-zА-Яа-яЁёӨөҮү]+)-(\d+[A-Za-zА-Яа-яЁёӨөҮү]?)/u,
    );

    if (!periodItem || !name || !roomMatch) {
      throw new Error('The PDF contains a row that could not be read.');
    }

    return {
      dayOfWeek,
      period: Number(periodItem.str.trim()),
      name,
      building: roomMatch[1],
      room: roomMatch[2],
    };
  });
}

function joinCell(items: PositionedText[]): string {
  return items
    .sort((first, second) => {
      if (first.y !== second.y) {
        return second.y - first.y;
      }
      return first.x - second.x;
    })
    .map((item) => item.str.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function multiplyMatrices(first: Matrix, second: Matrix): Matrix {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5],
  ];
}

function bytesToLatin1(bytes: Uint8Array): string {
  let result = '';
  const chunkSize = 8192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
    );
  }
  return result;
}

function latin1ToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

"use node";

/**
 * DOCX → text + hyperlinks for the resume pipeline (Node runtime).
 *
 * A .docx is a ZIP of XML parts. We only read the Word body (plus headers
 * and footers, where resumes often keep contact details), keep the visible
 * `w:t` runs, and recover hyperlink targets from Word's relationship files.
 * No XML/zip dependency: the parser is bounded, offline, and unit-tested.
 */
import { inflateRawSync } from 'node:zlib';

/** No single Word XML part should inflate past this. */
const MAX_XML_BYTES = 8 * 1024 * 1024;
/** Total decompressed XML across all parts read for one resume. */
const MAX_TOTAL_XML_BYTES = 12 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 4096;
const MAX_PARTS = 24;

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

export interface DocxContent {
  text: string;
  links: string[];
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Decode the five XML entities plus numeric character references. Unknown
 *  entities stay literal instead of throwing or inventing characters. */
export function decodeXmlEntities(raw: string): string {
  return raw.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+);/gi,
    (whole, body: string) => {
      if (body.startsWith('#')) {
        const hex = body[1]?.toLowerCase() === 'x';
        const value = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
        if (
          !Number.isFinite(value) ||
          value <= 0 ||
          value > 0x10ffff ||
          (value >= 0xd800 && value <= 0xdfff)
        ) {
          return whole;
        }
        return String.fromCodePoint(value);
      }
      return XML_ENTITIES[body.toLowerCase()] ?? whole;
    },
  );
}

function u16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) {
    throw new Error('truncated DOCX zip');
  }
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new Error('truncated DOCX zip');
  }
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  if (bytes.length < 22) throw new Error('not a DOCX zip');
  const earliest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (u32(bytes, offset) === EOCD_SIG) return offset;
  }
  throw new Error('not a DOCX zip');
}

function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const eocd = findEndOfCentralDirectory(bytes);
  const disk = u16(bytes, eocd + 4);
  const centralDisk = u16(bytes, eocd + 6);
  const total = u16(bytes, eocd + 10);
  const centralSize = u32(bytes, eocd + 12);
  const centralOffset = u32(bytes, eocd + 16);
  if (disk !== 0 || centralDisk !== 0) {
    throw new Error('multi-disk DOCX zips are not supported');
  }
  if (total === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 DOCX files are not supported');
  }
  if (total > MAX_ZIP_ENTRIES) throw new Error('DOCX has too many zip entries');
  if (centralOffset + centralSize > bytes.length) {
    throw new Error('truncated DOCX zip directory');
  }

  const entries = new Map<string, ZipEntry>();
  let cursor = centralOffset;
  const decoder = new TextDecoder('utf-8');
  for (let index = 0; index < total; index += 1) {
    if (u32(bytes, cursor) !== CENTRAL_SIG) {
      throw new Error('corrupt DOCX zip directory');
    }
    const flags = u16(bytes, cursor + 8);
    const method = u16(bytes, cursor + 10);
    const compressedSize = u32(bytes, cursor + 20);
    const uncompressedSize = u32(bytes, cursor + 24);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const localOffset = u32(bytes, cursor + 42);
    const nameStart = cursor + 46;
    if (nameStart + nameLength > bytes.length) {
      throw new Error('truncated DOCX zip directory');
    }
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.set(name, {
      name,
      flags,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    cursor = nameStart + nameLength + extraLength + commentLength;
    if (cursor > bytes.length) throw new Error('truncated DOCX zip directory');
  }
  return entries;
}

function readEntry(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  if ((entry.flags & 0x1) !== 0) {
    throw new Error('encrypted DOCX parts are not supported');
  }
  if (entry.uncompressedSize > MAX_XML_BYTES) {
    throw new Error('DOCX XML part is too large');
  }
  if (u32(bytes, entry.localOffset) !== LOCAL_SIG) {
    throw new Error('corrupt DOCX zip entry');
  }
  const nameLength = u16(bytes, entry.localOffset + 26);
  const extraLength = u16(bytes, entry.localOffset + 28);
  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length) throw new Error('truncated DOCX zip entry');
  const compressed = bytes.subarray(dataStart, dataEnd);

  let out: Uint8Array;
  if (entry.method === 0) {
    out = compressed;
  } else if (entry.method === 8) {
    out = inflateRawSync(compressed, { maxOutputLength: MAX_XML_BYTES });
  } else {
    throw new Error('unsupported DOCX zip compression');
  }
  if (entry.uncompressedSize > 0 && out.length !== entry.uncompressedSize) {
    throw new Error('corrupt DOCX zip entry size');
  }
  return out;
}

function partRank(name: string): number {
  if (name === 'word/document.xml') return 0;
  if (/^word\/header\d*\.xml$/i.test(name)) return 1;
  return 2;
}

/**
 * Visible text only: `w:t` runs, paragraph breaks, tabs, and soft breaks.
 * Deleted text (`w:delText`) and field instructions are deliberately not
 * treated as resume content.
 */
export function docxXmlText(xml: string): string {
  const chunks: string[] = [];
  const token =
    /<w:t(?![A-Za-z0-9])[^>]*\/>|<w:t(?![A-Za-z0-9])[^>]*>([\s\S]*?)<\/w:t>|<w:tab(?:\s[^>]*)?\/>|<w:br(?:\s[^>]*)?\/>|<w:cr(?:\s[^>]*)?\/>|<\/w:p>|<\/w:tc>/g;
  for (const match of xml.matchAll(token)) {
    if (match[1] !== undefined) {
      chunks.push(decodeXmlEntities(match[1]));
    } else if (match[0].startsWith('<w:tab')) {
      chunks.push('\t');
    } else if (match[0].startsWith('<w:br') || match[0].startsWith('<w:cr')) {
      chunks.push('\n');
    } else if (match[0] === '</w:p>') {
      chunks.push('\n');
    } else if (match[0] === '</w:tc>') {
      chunks.push('\t');
    }
  }
  return chunks
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function attr(tag: string, name: string): string {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'),
  );
  return decodeXmlEntities(match?.[1] ?? match?.[2] ?? '').trim();
}

function relationshipLinks(xml: string): string[] {
  const links: string[] = [];
  for (const match of xml.matchAll(/<Relationship\b[^>]*>/gi)) {
    const tag = match[0];
    const type = attr(tag, 'Type').toLowerCase();
    const target = attr(tag, 'Target');
    const targetMode = attr(tag, 'TargetMode').toLowerCase();
    if (!type.endsWith('/hyperlink')) continue;
    if (targetMode !== '' && targetMode !== 'external') continue;
    if (/^https?:\/\//i.test(target)) links.push(target);
  }
  return links;
}

function fieldLinks(xml: string): string[] {
  const links: string[] = [];
  for (const match of xml.matchAll(
    /<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>/gi,
  )) {
    const instruction = decodeXmlEntities(match[1] ?? '');
    for (const link of instruction.matchAll(
      /HYPERLINK\s+(?:"([^"]+)"|'([^']+)'|([^\s\\]+))/gi,
    )) {
      const target = (link[1] ?? link[2] ?? link[3] ?? '').trim();
      if (/^https?:\/\//i.test(target)) links.push(target);
    }
  }
  return links;
}

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

export function extractDocxContent(bytes: Uint8Array): DocxContent {
  const entries = zipEntries(bytes);
  if (!entries.has('[Content_Types].xml') || !entries.has('word/document.xml')) {
    throw new Error('not a Word DOCX file');
  }
  const names = [...entries.keys()];
  const parts = names
    .filter((name) => /^word\/(?:document|header\d*|footer\d*)\.xml$/i.test(name))
    .sort((a, b) => partRank(a) - partRank(b) || a.localeCompare(b))
    .slice(0, MAX_PARTS);
  const rels = names.filter((name) =>
    /^word\/_rels\/(?:document|header\d*|footer\d*)\.xml\.rels$/i.test(name),
  );

  let total = 0;
  const decoder = new TextDecoder('utf-8');
  const textParts: string[] = [];
  const links: string[] = [];
  for (const name of parts) {
    const xmlBytes = readEntry(bytes, entries.get(name)!);
    total += xmlBytes.length;
    if (total > MAX_TOTAL_XML_BYTES) throw new Error('DOCX XML is too large');
    const xml = decoder.decode(xmlBytes);
    textParts.push(docxXmlText(xml));
    links.push(...fieldLinks(xml));
  }
  for (const name of rels) {
    const xmlBytes = readEntry(bytes, entries.get(name)!);
    total += xmlBytes.length;
    if (total > MAX_TOTAL_XML_BYTES) throw new Error('DOCX XML is too large');
    links.push(...relationshipLinks(decoder.decode(xmlBytes)));
  }

  return {
    text: textParts
      .filter((part) => part !== '')
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    links: dedupe(links),
  };
}

export function extractDocxText(bytes: Uint8Array): string {
  return extractDocxContent(bytes).text;
}

/** Hidden hyperlink targets that are not present in the visible text. */
export function extractDocxLinkAnnotations(bytes: Uint8Array): string[] {
  return extractDocxContent(bytes).links;
}

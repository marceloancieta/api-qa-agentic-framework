// A small reader for the tar archives `git archive` writes (ustar with pax headers), so the package
// needs no dependency to unpack the framework. It reads regular files and directories; any other
// entry type (a link, a device) is refused, because a framework release holds none.

import { gunzipSync } from 'node:zlib';

const BLOCK = 512;

const text = (buffer, start, length) => {
  const field = buffer.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end < 0 ? field.length : end).toString('utf8');
};

const octal = (buffer, start, length) => {
  const value = text(buffer, start, length).trim();
  return value ? Number.parseInt(value, 8) : 0;
};

/** The records of a pax header body: `<length> <key>=<value>\n`, repeated. */
export function paxRecords(body) {
  const records = {};
  let at = 0;
  while (at < body.length) {
    const space = body.indexOf(0x20, at);
    if (space < 0) break;
    const length = Number(body.subarray(at, space).toString('utf8'));
    if (!Number.isInteger(length) || length <= 0)
      throw new Error('A pax header record is malformed.');
    const record = body.subarray(space + 1, at + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (equals > 0) records[record.slice(0, equals)] = record.slice(equals + 1);
    at += length;
  }
  return records;
}

/**
 * The entries of a tar archive (gzip-compressed or not): `[{ path, type: 'file' | 'directory',
 * mode, data }]`, and `comment`, the global pax comment (`git archive` writes the commit id there).
 */
export function readTar(archive) {
  const buffer = archive[0] === 0x1f && archive[1] === 0x8b ? gunzipSync(archive) : archive;
  const entries = [];
  let comment = null;
  let next = {};
  for (let at = 0; at + BLOCK <= buffer.length;) {
    const header = buffer.subarray(at, at + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const stored = octal(header, 148, 8);
    let sum = 0;
    for (let i = 0; i < BLOCK; i += 1) sum += i >= 148 && i < 156 ? 0x20 : header[i];
    if (sum !== stored) throw new Error(`The tar header at byte ${at} has a bad checksum.`);
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 0x30);
    const body = buffer.subarray(at + BLOCK, at + BLOCK + size);
    at += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (type === 'g') {
      comment = paxRecords(body).comment ?? comment;
      continue;
    }
    if (type === 'x') {
      next = paxRecords(body);
      continue;
    }
    const prefix = text(header, 345, 155);
    const name = text(header, 0, 100);
    const path = next.path ?? (prefix ? `${prefix}/${name}` : name);
    next = {};
    if (type === '0' || type === '7') {
      entries.push({ path, type: 'file', mode: octal(header, 100, 8), data: Buffer.from(body) });
    } else if (type === '5') {
      entries.push({
        path: path.replace(/\/$/, ''),
        type: 'directory',
        mode: octal(header, 100, 8),
      });
    } else {
      throw new Error(
        `${path} is a tar entry of type "${type}", which a framework release never holds.`,
      );
    }
  }
  return { entries, comment };
}

/** A path from an archive is safe to write under a directory: relative, without `..`. */
export function safePath(path) {
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !/^[A-Za-z]:/.test(path) &&
    !path.includes('\\') &&
    !path.split('/').includes('..')
  );
}

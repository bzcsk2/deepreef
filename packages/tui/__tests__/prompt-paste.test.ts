import { describe, expect, it } from 'bun:test';
import {
  countLines,
  expandTrackedPastes,
  insertSummarizedPasteAt,
  removePastePart,
  shouldSummarizePaste,
} from '../src/prompt-paste.js';

describe('prompt-paste', () => {
  it('counts lines including single line', () => {
    expect(countLines('hello')).toBe(1);
    expect(countLines('a\nb\nc')).toBe(3);
  });

  it('summarizes when line count or length exceeds threshold', () => {
    expect(shouldSummarizePaste('a\nb')).toBe(false);
    expect(shouldSummarizePaste('a\nb\nc')).toBe(true);
    expect(shouldSummarizePaste('x'.repeat(151))).toBe(true);
  });

  it('expandTrackedPastes only replaces tracked placeholder occurrence', () => {
    const marker = '[粘贴 +3 行]';
    const prefix = `keep ${marker} then `;
    const input = prefix + marker + ' tail';
    const parts = [{
      marker,
      text: 'alpha\nbeta\ngamma',
      start: prefix.length,
      end: prefix.length + marker.length,
    }];
    expect(expandTrackedPastes(input, parts)).toBe(`keep ${marker} then alpha\nbeta\ngamma tail`);
  });

  it('insertSummarizedPasteAt stores full text separately from display marker', () => {
    const full = 'line1\nline2\nline3';
    const marker = '[粘贴 +3 行]';
    const { input, parts, cursor } = insertSummarizedPasteAt('prefix ', [], 7, full, marker);
    expect(input).toBe('prefix [粘贴 +3 行]');
    expect(cursor).toBe(7 + marker.length);
    expect(expandTrackedPastes(input, parts)).toBe(`prefix ${full}`);
  });

  it('removePastePart deletes marker and keeps other text', () => {
    const marker = '[粘贴 +2 行]';
    const { input, parts } = insertSummarizedPasteAt('hi ', [], 3, 'a\nb', marker);
    const part = parts[0]!;
    const removed = removePastePart(input, parts, part);
    expect(removed.input).toBe('hi ');
    expect(removed.parts).toEqual([]);
    expect(removed.cursor).toBe(3);
  });
});

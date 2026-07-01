import { describe, it, expect } from 'vitest';
import {
  findWordLeft,
  findWordRight,
} from '../src/DeepiPromptInput.js';
import {
  insertPlainTextAt,
  insertSummarizedPasteAt,
  removePastePart,
  findPastePartAt,
  findPastePartEndingAt,
  expandTrackedPastes,
} from '../src/prompt-paste.js';

describe('findWordLeft', () => {
  it('returns 0 when pos is 0', () => {
    expect(findWordLeft('hello world', 0)).toBe(0);
  });

  it('jumps to start of current word from end', () => {
    expect(findWordLeft('hello world', 11)).toBe(6);
  });

  it('jumps to previous word after whitespace', () => {
    expect(findWordLeft('hello world', 6)).toBe(0);
  });

  it('handles CJK characters', () => {
    expect(findWordLeft('hello 世界 world', 14)).toBe(9);
    expect(findWordLeft('hello 世界 world', 9)).toBe(6);
  });

  it('handles punctuation between words', () => {
    expect(findWordLeft('hello,world', 11)).toBe(6);
  });

  it('handles mixed word classes', () => {
    expect(findWordLeft('abc_def ghi', 8)).toBe(0);
  });

  it('handles consecutive spaces', () => {
    expect(findWordLeft('hello    world', 14)).toBe(9);
  });

  it('returns 0 for empty or single-char inputs', () => {
    expect(findWordLeft('', 0)).toBe(0);
    expect(findWordLeft('a', 1)).toBe(0);
  });
});

describe('findWordRight', () => {
  it('returns text.length when pos is at end', () => {
    expect(findWordRight('hello world', 11)).toBe(11);
  });

  it('jumps to next word from start of current', () => {
    expect(findWordRight('hello world', 0)).toBe(6);
  });

  it('jumps to next word from middle of current', () => {
    expect(findWordRight('hello world', 3)).toBe(6);
  });

  it('skips spaces to next word', () => {
    expect(findWordRight('hello  world', 5)).toBe(7);
  });

  it('handles CJK characters', () => {
    expect(findWordRight('hello 世界 world', 6)).toBe(9);
  });

  it('handles punctuation', () => {
    expect(findWordRight('hello,world', 0)).toBe(5);
  });

  it('returns text.length when at last word', () => {
    expect(findWordRight('hello world', 6)).toBe(11);
  });
});

describe('paste marker integration (D1 backspace/delete)', () => {
  it('findPastePartAt detects cursor inside paste marker', () => {
    const { input, parts } = insertSummarizedPasteAt('prefix ', [], 7, 'a\nb\nc', '[+3]');
    const mid = input.indexOf('[+3]') + 1;
    expect(findPastePartAt(parts, mid)).toBe(parts[0]);
  });

  it('findPastePartEndingAt detects cursor at paste marker end boundary', () => {
    const { input, parts } = insertSummarizedPasteAt('prefix ', [], 7, 'a\nb\nc', '[+3]');
    const end = input.indexOf('[+3]') + 4;
    expect(findPastePartEndingAt(parts, end)).toBe(parts[0]);
  });

  it('removePastePart removes entire paste marker from middle of text', () => {
    const { input, parts } = insertSummarizedPasteAt('start ', [], 6, 'a\nb\nc', '[+3]');
    const removed = removePastePart(input, parts, parts[0]);
    expect(removed.input).toBe('start ');
    expect(removed.parts).toEqual([]);
    expect(removed.cursor).toBe(6);
  });

  it('removePastePart preserves surrounding text', () => {
    const full = insertSummarizedPasteAt('hello ', [], 6, 'x\nx\nx', '[+3]');
    const part = full.parts[0];
    const removed = removePastePart(full.input, full.parts, part);
    expect(removed.input).toBe('hello ');
    expect(expandTrackedPastes(removed.input, removed.parts)).toBe('hello ');
  });

  it('insertPlainTextAt inserts around paste markers correctly', () => {
    const { input, parts } = insertSummarizedPasteAt('a', [], 1, 'b\nb', '[+2]');
    const withExtra = insertPlainTextAt(input, parts, 0, 'prefix ');
    expect(withExtra.input).toBe('prefix a[+2]');
    expect(expandTrackedPastes(withExtra.input, withExtra.parts)).toBe('prefix ab\nb');
  });
});

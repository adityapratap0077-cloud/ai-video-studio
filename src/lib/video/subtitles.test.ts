import { describe, expect, it } from 'vitest';
import {
  escapeDrawtext,
  escapeFilterPath,
  escapeConcatPath,
  looksLikeVtt,
  toDurationSec,
  vttToSrt,
} from './subtitles';

describe('vttToSrt', () => {
  it('converts a basic WebVTT document to numbered SRT cues', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:02.500',
      'Hello world',
      '',
      '00:00:02.500 --> 00:00:05.000',
      'Second line',
      'still second',
    ].join('\n');

    expect(vttToSrt(vtt)).toBe(
      [
        '1',
        '00:00:00,000 --> 00:00:02,500',
        'Hello world',
        '',
        '2',
        '00:00:02,500 --> 00:00:05,000',
        'Second line',
        'still second',
      ].join('\n'),
    );
  });

  it('normalizes mm:ss.mmm timestamps and drops cue identifiers and tags', () => {
    const vtt = [
      'WEBVTT',
      'Kind: captions',
      '',
      'cue-1',
      '00:01.500 --> 00:04.000 align:start',
      '<v Narrator>Hello <b>there</b></v>',
    ].join('\n');

    expect(vttToSrt(vtt)).toBe(
      ['1', '00:00:01,500 --> 00:00:04,000', 'Hello there'].join('\n'),
    );
  });

  it('skips NOTE blocks', () => {
    const vtt = [
      'WEBVTT',
      '',
      'NOTE this is a comment',
      'spanning lines',
      '',
      '00:00:00.000 --> 00:00:01.000',
      'Kept',
    ].join('\n');

    expect(vttToSrt(vtt)).toBe(['1', '00:00:00,000 --> 00:00:01,000', 'Kept'].join('\n'));
  });
});

describe('looksLikeVtt', () => {
  it('detects WEBVTT headers', () => {
    expect(looksLikeVtt('WEBVTT\n\n00:00:00.000 --> 1')).toBe(true);
    expect(looksLikeVtt('1\n00:00:00,000 --> 00:00:01,000')).toBe(false);
  });
});

describe('escapeDrawtext', () => {
  it('replaces apostrophes and percent signs per ffmpeg parser quirks', () => {
    expect(escapeDrawtext("it's 100% great")).toBe('it’s 100percent great');
  });

  it('escapes filter-special characters', () => {
    expect(escapeDrawtext('a:b,c\\d')).toBe('a\\:b\\,c\\\\d');
  });

  it('collapses whitespace', () => {
    expect(escapeDrawtext('  hello\n  world  ')).toBe('hello world');
  });
});

describe('escapeFilterPath', () => {
  it('escapes colons and backslashes for filter args', () => {
    expect(escapeFilterPath('/tmp/my:dir/caps.srt')).toBe('/tmp/my\\:dir/caps.srt');
    expect(escapeFilterPath("C:\\path\\x.srt")).toBe('C\\:\\\\path\\\\x.srt');
  });
});

describe('escapeConcatPath', () => {
  it("quotes single quotes for the concat list file", () => {
    expect(escapeConcatPath("/tmp/o'brien/seg.mp4")).toBe("/tmp/o'\\''brien/seg.mp4");
  });
});

describe('toDurationSec', () => {
  it('clamps invalid durations to the fallback', () => {
    expect(toDurationSec(0)).toBe(3);
    expect(toDurationSec(-1)).toBe(3);
    expect(toDurationSec(NaN)).toBe(3);
    expect(toDurationSec(2.5)).toBe(2.5);
  });
});

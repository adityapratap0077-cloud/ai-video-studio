/**
 * Caption + ffmpeg filter-text helpers.
 *
 * ffmpeg's drawtext and subtitles filters have their own mini-syntax:
 * - drawtext: NEVER use a plain ASCII apostrophe in text=... (the graph
 *   parser swallows subsequent filters); use U+2019 instead. A literal %
 *   triggers "Stray %" expansion — write "percent" instead.
 * - subtitles=filename: colons and backslashes in the path must be escaped.
 */

/** WebVTT cue timestamp: 00:01:02.500 or 01:02.500 */
const VTT_TS = /(\d{2,}):(\d{2}):(\d{2})\.(\d{3})/g;
const VTT_TS_SHORT = /(\d{2}):(\d{2})\.(\d{3})/g;

/**
 * Convert WebVTT content to SubRip (SRT).
 * - Drops the WEBVTT header, NOTE blocks and cue identifiers.
 * - Converts 00:00:01.000 -> 00:00:01,000 and numbers the cues.
 */
export function vttToSrt(vtt: string): string {
  const lines = vtt.replace(/\r\n?/g, '\n').split('\n');
  const cues: Array<{ start: string; end: string; text: string[] }> = [];
  let current: { start: string; end: string; text: string[] } | null = null;
  let inHeader = true;

  const tsLine = /--> /;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (inHeader) {
      if (line.startsWith('WEBVTT')) continue;
      if (line === '') {
        inHeader = false;
        continue;
      }
      // Header metadata lines (Kind:, Language:) are skipped.
      continue;
    }
    if (line.startsWith('NOTE')) {
      // Skip NOTE blocks: consume until blank line.
      current = null;
      continue;
    }
    if (line === '') {
      if (current) {
        cues.push(current);
        current = null;
      }
      continue;
    }
    if (tsLine.test(line)) {
      if (current) cues.push(current);
      const [startRaw, rest] = line.split('-->');
      const endRaw = rest.trim().split(/\s+/)[0];
      current = {
        start: vttTimestampToSrt(startRaw.trim()),
        end: vttTimestampToSrt(endRaw),
        text: [],
      };
      continue;
    }
    // Cue identifier or cue payload line.
    if (current) {
      current.text.push(stripVttTags(line));
    }
    // else: cue identifier line with no active cue — ignored.
  }
  if (current) cues.push(current);

  return cues
    .map(
      (cue, i) =>
        `${i + 1}\n${cue.start} --> ${cue.end}\n${cue.text.join('\n')}`,
    )
    .join('\n\n');
}

function vttTimestampToSrt(ts: string): string {
  // Normalize mm:ss.mmm -> 00:mm:ss,mmm and hh:mm:ss.mmm -> hh:mm:ss,mmm
  let norm = ts;
  if (/^\d{2}:\d{2}\.\d{3}$/.test(norm)) {
    norm = `00:${norm}`;
  }
  return norm.replace('.', ',');
}

/** Strip WebVTT voice/formatting tags like <v Speaker> and <b>. */
function stripVttTags(line: string): string {
  return line.replace(/<\/?[^>]+>/g, '').trim();
}

/** True when the string looks like WebVTT (rather than SRT already). */
export function looksLikeVtt(text: string): boolean {
  return /^\s*WEBVTT/m.test(text);
}

/**
 * Sanitize arbitrary text for ffmpeg drawtext=text='...'.
 * - ASCII apostrophe -> U+2019 (right single quotation mark)
 * - % -> the word "percent" (stray % breaks the parser)
 * - escape backslash, colon, comma, single-quote for the filter parser
 * - collapse whitespace/newlines (drawtext is single-line here)
 */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/'/g, '’')
    .replace(/%/g, 'percent')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escape a filesystem path for use inside an ffmpeg filter argument, e.g.
 * subtitles=filename='...'. Colons and backslashes are the dangerous ones;
 * single quotes inside the quoted value are backslash-escaped.
 */
export function escapeFilterPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

/** Escape a path for the concat demuxer list file: file '<path>'. */
export function escapeConcatPath(filePath: string): string {
  return filePath.replace(/'/g, "'\\''");
}

/** Coerce to a finite positive number for -t / duration args. */
export function toDurationSec(value: number, fallback = 3): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, 3600);
}

export { VTT_TS, VTT_TS_SHORT };

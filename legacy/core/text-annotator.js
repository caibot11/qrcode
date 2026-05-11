// Text annotator: scans text and wraps glossary terms in hoverable <span>s
import { getSortedTermKeys } from './glossary.js';

const sortedTerms = getSortedTermKeys();

/**
 * Takes a plain text string, returns HTML with matched glossary terms
 * wrapped in <span class="glossary-term" data-term="key">term</span>
 * Sorts terms longest-first to prevent partial matches.
 * Case-insensitive matching.
 */
export function annotateText(text) {
  if (!text) return '';

  // Build a list of matches with positions
  const matches = [];
  const lowerText = text.toLowerCase();

  for (const term of sortedTerms) {
    const lowerTerm = term.toLowerCase();
    let startIdx = 0;
    while (true) {
      const idx = lowerText.indexOf(lowerTerm, startIdx);
      if (idx === -1) break;

      // Check word boundaries — don't match inside other words
      const before = idx > 0 ? text[idx - 1] : ' ';
      const after = idx + term.length < text.length ? text[idx + term.length] : ' ';
      const wordBoundary = /[\s.,;:!?()\-\u2014"'\/]|^$/;

      if (wordBoundary.test(before) && wordBoundary.test(after)) {
        matches.push({ start: idx, end: idx + term.length, term });
      }
      startIdx = idx + 1;
    }
  }

  if (matches.length === 0) return escapeHtml(text);

  // Sort by start position, then longest first for overlapping
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  // Remove overlapping matches (keep the first/longest one)
  const filtered = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }

  // Build result HTML
  let result = '';
  let pos = 0;
  for (const m of filtered) {
    if (m.start > pos) {
      result += escapeHtml(text.slice(pos, m.start));
    }
    const originalText = text.slice(m.start, m.end);
    result += `<span class="glossary-term" data-term="${escapeAttr(m.term)}">${escapeHtml(originalText)}</span>`;
    pos = m.end;
  }
  if (pos < text.length) {
    result += escapeHtml(text.slice(pos));
  }

  return result;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

import { describe, expect, test } from 'bun:test';

import { applySummaries } from './release-summary';

const summaries = {
  '0.4.8': 'This release makes the AI faster on every platform.',
  '0.4.7': 'Problem mode and a friendlier comment panel.',
};

describe('applySummaries', () => {
  test('inserts the summary under its version heading', () => {
    const out = applySummaries('## [0.4.8] - 2026-09-12\n\n### Features\n', summaries);
    expect(out).toBe(
      '## [0.4.8] - 2026-09-12\n\nThis release makes the AI faster on every platform.\n\n### Features\n'
    );
  });

  test('handles every version in a full changelog', () => {
    const out = applySummaries('## [0.4.8] - 2026-09-12\n\n## [0.4.7] - 2026-06-09\n', summaries);
    expect(out).toContain('faster on every platform.\n\n## [0.4.7]');
    expect(out).toContain('friendlier comment panel.');
  });

  test('leaves versions without a summary alone', () => {
    const input = '## [0.4.6] - 2026-05-24\n\n### Fixes\n';
    expect(applySummaries(input, summaries)).toBe(input);
  });

  test('fills an unreleased heading with the version being cut', () => {
    const out = applySummaries('## [unreleased]\n\n### Features\n', summaries, '0.4.8');
    expect(out).toContain('## [unreleased]\n\nThis release makes the AI faster');
  });

  test('is idempotent', () => {
    const once = applySummaries('## [0.4.8] - 2026-09-12\n\n### Features\n', summaries);
    expect(applySummaries(once, summaries)).toBe(once);
  });
});

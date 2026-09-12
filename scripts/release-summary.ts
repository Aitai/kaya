#!/usr/bin/env bun
/**
 * Release summaries: the one or two sentences that open a release's notes.
 *
 * The release workflow regenerates CHANGELOG.md in full from the commit history
 * on every release, so a summary written straight into the file would be erased
 * by the next one. Summaries therefore live in release-summaries.json, keyed by
 * version, and are re-injected into every generated changelog.
 *
 * Usage:
 *   bun run release-summary set <version> [text]     # record (empty text = no-op)
 *   bun run release-summary apply <file> [version]   # inject into a changelog
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';

const SUMMARIES_FILE = 'release-summaries.json';

export type Summaries = Record<string, string>;

export function readSummaries(file = SUMMARIES_FILE): Summaries {
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf-8')) as Summaries;
}

function writeSummaries(summaries: Summaries, file = SUMMARIES_FILE): void {
  const sorted = Object.keys(summaries).sort(compareVersionsDesc);
  const ordered: Summaries = {};
  for (const version of sorted) ordered[version] = summaries[version]!;
  writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`);
}

function compareVersionsDesc(a: string, b: string): number {
  const parts = (v: string) => v.split(/[.-]/).map(p => (/^\d+$/.test(p) ? Number(p) : p));
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const [x, y] = [pa[i] ?? 0, pb[i] ?? 0];
    if (x === y) continue;
    return typeof x === 'number' && typeof y === 'number'
      ? y - x
      : String(y).localeCompare(String(x));
  }
  return 0;
}

/**
 * Insert each known summary right below its version heading.
 *
 * `version` names the release being cut, so its summary also lands under an
 * `## [unreleased]` heading — that is what `git-cliff --unreleased` produces
 * when previewing before the tag exists.
 */
export function applySummaries(markdown: string, summaries: Summaries, version?: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    out.push(line);

    const heading = /^## \[([^\]]+)\]/.exec(line);
    if (!heading) continue;

    const key = heading[1] === 'unreleased' ? version : heading[1];
    const summary = key ? summaries[key.replace(/^v/, '')] : undefined;
    if (!summary) continue;

    // Already there (the file was generated with summaries once before).
    const next = lines.slice(i + 1).find(l => l.trim() !== '');
    if (next?.trim() === summary.trim()) continue;

    out.push('', summary.trim());
  }

  return out.join('\n');
}

function main(): void {
  const [command, ...args] = process.argv.slice(2);

  if (command === 'set') {
    const [version, text] = args;
    if (!version) throw new Error('Usage: release-summary set <version> [text]');
    if (!text?.trim()) {
      console.log('No summary given — leaving release-summaries.json untouched.');
      return;
    }
    const summaries = readSummaries();
    summaries[version.replace(/^v/, '')] = text.trim().replace(/\s+/g, ' ');
    writeSummaries(summaries);
    console.log(`Recorded summary for ${version}.`);
    return;
  }

  if (command === 'apply') {
    const [file, version] = args;
    if (!file) throw new Error('Usage: release-summary apply <file> [version]');
    const summaries = readSummaries();
    if (Object.keys(summaries).length === 0) {
      console.log('No summaries recorded — nothing to inject.');
      return;
    }
    writeFileSync(
      file,
      applySummaries(readFileSync(file, 'utf-8'), summaries, version?.replace(/^v/, ''))
    );
    console.log(`Injected release summaries into ${file}.`);
    return;
  }

  throw new Error(`Unknown command "${command ?? ''}". Expected "set" or "apply".`);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

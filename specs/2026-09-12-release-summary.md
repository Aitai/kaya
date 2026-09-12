---
date: 2026-09-12
status: shipped
scope: release
---

# A release needs a sentence, not only a list of commits

The changelog has always been generated from conventional commits by
`git-cliff`. That answers "what changed" precisely and "what is this release
about" not at all: a reader landing on the GitHub release, or seeing the
updater prompt in the app, gets 40 bullet points and no lede. v0.4.8 is a
good example — the AI work across #173, #178 and #180 is one story told in
three commits, and nothing in the generated notes says so.

So: one or two sentences at the top of the notes, written by a human at
release time.

## Where it cannot live

The obvious place is `CHANGELOG.md`. It does not work, because the release
workflow runs

```bash
git-cliff --tag "v${VERSION}" -o CHANGELOG.md
```

which regenerates the **whole file** from the commit history on every
release. Any sentence typed into it survives exactly until the next release
wipes it. Same reason rules out a `{{ env.* }}` variable in `cliff.toml`:
the value would be re-applied to every version section, or to none.

## Decision

Summaries live in [`release-summaries.json`](../release-summaries.json) at
the repo root, keyed by version, and are re-injected after every generation
by [`scripts/release-summary.ts`](../scripts/release-summary.ts):

- `release-summary set <version> <text>` — records one (a no-op on empty
  text, so the field stays optional).
- `release-summary apply <file> [version]` — inserts every known summary
  under its `## [x.y.z]` heading, matching `## [unreleased]` against the
  version being cut so local previews work too.

In `release.yml` this is two steps: record the `summary` dispatch input
before generating, apply to both `CHANGELOG.md` and `CHANGELOG-NEW.md`
after. The GitHub release body and the updater's `latest.json` notes are
already built from `CHANGELOG-NEW.md`, so they pick it up for free.

The file is committed as part of the release commit, so every past summary
is replayed into every future regeneration of `CHANGELOG.md`.

## Learnings

- The dispatch input is the right entry point: you are already typing the
  version there, and the summary is only writable once you know what the
  release contains. Editing `release-summaries.json` in a PR beforehand
  works too — useful when the sentence deserves review.
- Injection is idempotent (it checks the following paragraph), so a re-run
  of a failed release does not double the summary.
- Keeping the generator untouched matters: a release with no summary
  produces byte-for-byte what it produced before.

## Links

- [docs/RELEASE.md](../docs/RELEASE.md) — the workflow as it stands now

---
date: 2026-09-12
status: shipped
scope: ci, packaging
---

# A 429 from Hugging Face shipped a `.deb` with a feature missing

The v0.4.9 release built green, passed every Linux gate, and produced a
`.deb` of **41 MB** where every release since v0.4.5 had been **115 MB**. The
`.dmg`, `.exe` and `.AppImage` of the same run were unchanged to within a few
kilobytes.

## Finding it

Nothing in the diff could explain 74 MB, so the artifacts were read instead:

1. `ar x` + `tar tzf` on both packages: same 34 entries, and the whole
   difference is in one file — `usr/bin/kaya`, 162 MB against 88 MB.
2. Section sizes (`objdump -h`): `.text` identical to within 3 KB,
   `.rodata` down by exactly 74,420,224 bytes. Not code — embedded data.
3. `strings`: `/models/moku-v3.onnx` is present in the v0.4.8 binary and
   absent from v0.4.9's. Tauri embeds the frontend `dist`, models included.
4. The build log says it outright:
   `⚠️  Failed to download Moku model: 429 Too Many Requests`.

The four other jobs in the same run logged `Moku model downloaded: 77.1 MB`.
One runner got rate-limited, and only that one produced a package with board
recognition quietly broken.

## Why it got through

[`scripts/copy-assets.ts`](../scripts/copy-assets.ts) treated the download as
best-effort:

```ts
const response = await fetch(modelUrl);
if (!response.ok) {
  console.warn(`⚠️  Failed to download Moku model: …`);
  return; // build continues, 77 MB lighter
}
```

and the script ended with `main().catch(console.error)` — so even a thrown
error would have exited 0. Two independent layers of "carry on regardless".

The release gates didn't catch it either, and reasonably so: they prove the
packages **install** and that the AppImage **launches**. Neither says anything
about what is inside.

## Decision

- Retry the download (4 attempts, 2s → 18s backoff). A 429 is transient and a
  single attempt was never a plan.
- Fail the build when it still can't be had **and `CI` is set**; warn and
  continue otherwise, so an offline checkout stays usable.
- Reject anything under 50 MB, on disk or freshly downloaded: a truncated file
  or a saved error page looks like success to the bundler.
- `main().catch` sets `process.exitCode = 1`.

v0.4.9's tag and draft were deleted and the release re-cut from the fix.

## Learnings

- `console.warn` in a build script is a silent failure with extra steps. The
  only difference between a warning and an error here was 74 MB of missing
  feature in a signed, published artifact.
- Comparing artifact sizes across releases is a cheap smoke test that caught
  what every CI gate missed. Worth doing by reflex before publishing a draft.
- A build that depends on a third-party download at package time can fail
  partially. Either vendor the asset or make the fetch load-bearing — the
  middle ground is what shipped here.

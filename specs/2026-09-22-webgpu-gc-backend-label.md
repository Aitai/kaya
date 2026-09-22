---
date: 2026-09-22
status: shipped
scope: ai
---

# Stop writing the runtime backend label into the setting

## Context

`Engine.getRuntimeInfo().backend` and `AISettings['backend']` are two different
vocabularies that overlap in most of their members. Runtime labels describe what
came up — `webgpu`, `webgpu-gc`, `webnn`, `native`, `native-cpu`, `pytorch`,
`wasm`. Settings values are persisted to `localStorage` and fed back into
`resolveBackendChain`, so they are limited to what `loadAISettings` will restore
— `auto`, `webgpu`, `webnn`, `webgl`, `wasm`, `native`, `native-cpu`,
`pytorch`.

`AIEngineContext` bridged the two with a cast:

```ts
if (aiSettings.backend !== 'auto' && aiSettings.backend !== result.activeBackend) {
  setAISettings({ backend: result.activeBackend as AISettings['backend'] });
}
```

`webgpu-gc` (WebGPU with graph capture, added with the WebGPU work in #50) is
not a member of the settings union, so a user who had selected WebGPU got:

1. WebGPU loads; `getRuntimeInfo()` reports `webgpu-gc` and it is persisted
   verbatim.
2. The engine key (model + backend + batch + board size) changed, so the
   provider disposed the working WebGPU engine and re-initialized.
3. `resolveBackendChain()` put `webgpu-gc` at the head of the chain.
   `initOneBackend()` switches on the chain with cases for `native-gpu`,
   `native-cpu`, `pytorch`, `webgpu`, `wasm` and **no `default`**, so the value
   fell through to the `executionProviders = ['wasm']` / `engineType = 'web'`
   initializers and built a WASM session — no error, no model conversion, no
   graph-capture log line.
4. That session reported `wasm`, which was persisted in turn. `wasm` _is_ a
   valid setting, so the state survived reloads: the app stayed on CPU, and the
   only clue was a status pill reading "CPU".

In the field this presented as "WebGPU doesn't work in Firefox". The tell was
that the _first_ initialization in the log used the GPU (converter, graph
capture and warm-up all succeeded, `backend=webgpu-gc`) while every later one
silently ran on WASM, and that `[OnnxEngine] WebGPU available` still appeared —
`createOnnxSession` probes WebGPU on every session creation, including the WASM
one, so that line is not evidence of which backend is running.

## Decision

- New `packages/ui/src/contexts/ai/backendVocabulary.ts` owns the boundary:
  `runtimeBackendToSetting()` (runtime → settings; `webgpu-gc` → `webgpu`;
  unknown → `auto`) and `settingToChainBackend()` (settings → chain head; `null`
  means "let the probe decide"). `resolveBackendChain()` and `AIEngineContext`
  both go through it and the `as AISettings['backend']` cast is gone.
- Graph capture collapses onto `'webgpu'`: it is a property of the session we
  happened to create (model-dependent, disabled by `?gc=0`), not a preference.
  So the first settings write no longer changes the engine key, which also stops
  the working engine from being torn down and rebuilt at startup.
- Unrecognised labels fail **safe**. A runtime label we cannot translate becomes
  `'auto'` rather than being written through, and a settings value we cannot
  translate falls back to the probe chain. An unknown label means the two
  vocabularies have drifted; re-probing recovers, whereas persisting a string
  nothing else understands poisons every later initialization. `'webgpu-gc'` as
  a _setting_ gets no exception — `loadAISettings` already drops it to `'auto'`,
  which is also the right answer on desktop where the WebGPU chain cannot run.
- `initOneBackend()` now throws on a backend id outside this vocabulary instead
  of keeping its `['wasm']` defaults. The silent default is what hid the bug;
  a failing chain step is logged by `tryEngineChain` and the next backend is
  tried, which is the honest version of the same outcome.
- `packages/ui/tests/backendVocabulary.test.ts` pins the boundary: the mapping
  of every runtime label, the round trip (every label maps to a settings value
  the chain can still interpret), and the invariant that broke — _the chain
  only ever contains backend ids `initOneBackend` has a case for_. Reverting
  `resolveBackendChain` to its pre-fix form fails that test.

## Limitations

- Users already pinned to `wasm` by this bug are indistinguishable from users
  who deliberately chose CPU, so they are not migrated: the value has to be set
  back to **Auto** in Advanced once. Values persisted as `webgpu-gc` are not in
  `loadAISettings`' whitelist and self-heal to `auto` on the next reload.

## Alternatives considered

- **Add `webgpu-gc` to the settings union and to `initOneBackend`.** Keeps the
  write-through and the second vocabulary alive, and dresses a session property
  up as a user preference. Also leaves the "unknown label" hole open for the
  next label anyone adds.
- **Only add `default: throw` to `initOneBackend`.** Turns the silent wrong
  answer into a visible failure, but still lets the first settings write dispose
  a working WebGPU engine and bounce the chain.
- **Stop persisting fallbacks at all** (session-only, instead of in
  `localStorage`). Would self-heal the affected users and would pick up a GPU
  that becomes available after a driver or browser update, but re-attempts a
  known-failing backend on every mount. That is a change to the fallback
  contract rather than a fix for this bug; worth revisiting on its own.

## Learnings

- Two vocabularies that overlap in most of their members do not need a type
  error to cross silently: one `as` cast is enough, and the overlap is what
  makes the divergence invisible in review.
- A `switch` with no `default`, over a value that is only _asserted_ to be a
  closed set, is a silent fallback rather than a safe one.
- Log lines that are emitted on every path ("WebGPU available") are worse than
  no log line; they read as evidence for the opposite of what happened.

## Links

- [Backend vocabulary boundary](../packages/ui/src/contexts/ai/backendVocabulary.ts)
- [WebGPU op decomposition + graph capture](2026-02-28-webgpu-op-decomposition.md) — where `webgpu-gc` came from
- [Precision follows the backend](2026-09-12-precision-follows-the-backend.md)

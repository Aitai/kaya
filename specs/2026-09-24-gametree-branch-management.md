---
date: 2026-09-24
status: shipped
scope: ui
---

# Game tree branch management: main line, context menu, no splicing

## Context

Two long-standing gaps in the game tree graph:

1. **Marking a line as main.** Kaya has no "main line" flag; the main line is
   whichever child is first in `children` at each node. `draft.shiftNode(id,
'main')` and `makeMainVariation` already existed, but the only ways to reach
   them were the Edit-mode toolbar and `Cmd/Ctrl+Shift+M` — and that shortcut
   was _also_ bound to `view.toggleHeader`, so one keypress toggled the header
   and reordered the tree at the same time.
2. **Removing branches.** `deleteNode` (node + subtree), `copyNode`/`pasteNode`
   and `deleteOtherBranches` all existed, but `cutNode` was never surfaced and
   the graph canvas had no per-node affordance at all — every action required
   entering Edit mode and finding a toolbar icon.

There was also a request to "splice" a move out of the middle of a line,
re-attaching the surviving tail to the deleted node's parent.

## Decision

### No splicing of move nodes

A move node is a board _transition_, not a container. Re-linking `P → N →
{C…}` into `P → {C…}` produces a structurally valid tree but an illegal game:
removing an odd number of moves flips the turn parity of everything after it,
and the tail was recorded on a board where `N`'s stone (and any captures it
caused) still existed. The coordinate stays, so the result is silently wrong
SGF.

This is not a Kaya limitation. Sabaki's "Remove Node" —
`parent.children.splice(index, 1)` in `@sabaki/immutable-gametree`, and Kaya's
`draft.removeNode` is the same fork of that code — deletes the node _and
orphans its children_. No mainstream SGF editor offers a move splice.

The sound replacements ship instead:

- **Delete Continuation** (new) — keep the current position, drop all its
  descendants. This is the real "I want to replay from here" operation, and it
  is why `deleteNode` alone was insufficient (it deletes the position too).
- **Delete Branch** — `deleteNode`: current node + subtree, cursor moves to the
  parent.
- **Delete Other Branches** — keep only the path to the current node.

Splicing remains defensible for _annotation-only_ nodes (no `B`/`W`, no
`AB`/`AW`/`AE`), which carry no board effect. That is deliberately out of
scope until something needs it.

### Context menu on graph nodes

`GameTreeContextMenu` (portal, viewport-clamped, `role="menu"`) is opened by
right-click via React Flow's `onNodeContextMenu`, and by long-press (450 ms,
cancelled by >8 px movement) via a `kaya:gametree-node-longpress` window event
dispatched by `StoneNode`. The event exists because React Flow only emits
`onNodeContextMenu` for mouse input and iOS Safari does not synthesise a
`contextmenu` event for long-presses.

The click that ends the gesture is stopped on the stone element itself, so it
never reaches React Flow's `onNodeClick` (which would navigate and close the
menu just opened). This is deliberately scoped to the node and reset on each
new pointer-down rather than a "ignore clicks for N ms" guard: an arbitrary
hold length would defeat a time window, and Android's `contextmenu` path emits
no click at all, which would leave such a guard armed for the next tap.

Branch actions were extracted from `useGameModification` into
`useBranchModification` in the same change — board/annotation editing stays in
the former, tree reshaping moves to the latter, keeping both inside the
file-size budget in CLAUDE.md.

The menu uses `role="menu"`/`role="menuitem"`, moves focus to the first item
on open, and supports ArrowUp/ArrowDown/Home/End (claimed with
`stopPropagation`, since those are also global board-navigation shortcuts) plus
Escape/Tab to dismiss. It has no keyboard _opener_ — keyboard users reach the
same actions through the Edit toolbar, which stays keyboard-accessible.

Right-clicking selects the node first (`goToNode`) because every branch action
operates on the current node.

### Rebind `view.toggleHeader`

Moved from `Cmd/Ctrl+Shift+M` to `Cmd/Ctrl+Shift+H`. `Cmd/Ctrl+Shift+M` is the
mnemonic and Sabaki-compatible binding for "Make Main Branch", and the two
handlers are independent window listeners — a shared binding meant both fired
on every press. Users who customised either shortcut keep their override.

## Learnings

- The collision was invisible to the settings collision detector, which only
  guards _manual_ rebinds. Two `DEFAULT_SHORTCUTS` entries can silently overlap.
- The `edit.*` shortcuts live in `useHeaderKeyboardShortcuts`, which is mounted
  by `Header` — so they stop working when the header is hidden. Left as-is here
  (out of scope), but it is the same class of bug and worth fixing by lifting
  the hook out of the header.
- Long-press needs its own event rather than `contextmenu` polyfilling: Android
  Chrome fires `contextmenu` on long-press, iOS Safari does not.

## Links

- `packages/ui/src/components/gametree/GameTreeContextMenu.tsx`
- `packages/ui/src/components/gametree/GameTreeGraphReactFlow.tsx`
- `packages/ui/src/hooks/game/useBranchModification.ts` (`deleteContinuation`)

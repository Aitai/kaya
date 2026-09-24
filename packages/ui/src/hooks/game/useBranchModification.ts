/**
 * Branch (variation) management for the game tree: make-main, copy/cut/paste,
 * subtree delete, continuation delete and pruning of sibling variations.
 *
 * Split out of `useGameModification` to keep that hook inside the file-size
 * budget in CLAUDE.md. Board/annotation editing lives there; anything that
 * reshapes the tree lives here.
 */

import { useCallback, useState } from 'react';
import { GameTree, type GameTreeNode } from '@kaya/gametree';
import { type SGFProperty } from '../../types/game';
import { boardCache } from '../../utils/gameCache';

interface UseBranchModificationProps {
  gameTree: GameTree<SGFProperty> | null;
  setGameTree: (tree: GameTree<SGFProperty>) => void;
  currentNodeId: number | string | null;
  setCurrentNodeId: (id: number | string) => void;
  setIsDirty: (dirty: boolean) => void;
}

export function useBranchModification({
  gameTree,
  setGameTree,
  currentNodeId,
  setCurrentNodeId,
  setIsDirty,
}: UseBranchModificationProps) {
  const [copiedBranch, setCopiedBranch] = useState<GameTreeNode<SGFProperty> | null>(null);

  const deleteNode = useCallback(() => {
    if (!gameTree || currentNodeId === null) return;
    const currentNode = gameTree.get(currentNodeId);
    if (!currentNode || !currentNode.parentId) return;

    const parentId = currentNode.parentId;
    const newTree = gameTree.mutate(draft => {
      draft.removeNode(currentNodeId);
    });

    setGameTree(newTree);
    setCurrentNodeId(parentId);
    setIsDirty(true);
  }, [gameTree, currentNodeId, setGameTree, setCurrentNodeId, setIsDirty]);

  const copyNode = useCallback(() => {
    if (!gameTree || currentNodeId === null) return;
    const currentNode = gameTree.get(currentNodeId);
    if (!currentNode) return;
    setCopiedBranch(currentNode);
  }, [gameTree, currentNodeId]);

  const pasteNode = useCallback(() => {
    if (!gameTree || currentNodeId === null || !copiedBranch) return;

    const newTree = gameTree.mutate(draft => {
      const copyNodeRecursive = (
        sourceNode: GameTreeNode<SGFProperty>,
        parentId: number | string
      ): void => {
        draft.appendNode(parentId, sourceNode.data);
        const parent = draft.get(parentId);
        if (!parent || parent.children.length === 0) return;
        const newNode = parent.children[parent.children.length - 1];
        for (const child of sourceNode.children) {
          copyNodeRecursive(child, newNode.id);
        }
      };
      copyNodeRecursive(copiedBranch, currentNodeId);
    });

    setGameTree(newTree);
    setIsDirty(true);
  }, [gameTree, currentNodeId, copiedBranch, setGameTree, setIsDirty]);

  const cutNode = useCallback(() => {
    copyNode();
    deleteNode();
  }, [copyNode, deleteNode]);

  const flattenVariations = useCallback(() => {
    console.warn('flattenVariations not implemented');
  }, []);

  const makeMainVariation = useCallback(() => {
    if (!gameTree || currentNodeId === null) return;
    const newTree = gameTree.mutate(draft => {
      let currentId = currentNodeId;
      while (currentId) {
        const node = draft.get(currentId);
        if (!node || !node.parentId) break;
        draft.shiftNode(currentId, 'main');
        currentId = node.parentId;
      }
    });
    setGameTree(newTree);
    setIsDirty(true);
  }, [gameTree, currentNodeId, setGameTree, setIsDirty]);

  const shiftVariation = useCallback(
    (direction: 'left' | 'right') => {
      if (!gameTree || currentNodeId === null) return;
      const newTree = gameTree.mutate(draft => {
        draft.shiftNode(currentNodeId, direction);
      });
      setGameTree(newTree);
      setIsDirty(true);
    },
    [gameTree, currentNodeId, setGameTree, setIsDirty]
  );

  /**
   * Delete all branches except the current path from root to current node.
   * This keeps only the main line leading to the current position.
   */
  const deleteOtherBranches = useCallback(() => {
    if (!gameTree || currentNodeId === null) return;

    // Build the path from root to current node
    const pathToCurrentNode = new Set<number | string>();
    let nodeId: number | string | null = currentNodeId;

    while (nodeId !== null) {
      pathToCurrentNode.add(nodeId);
      const node = gameTree.get(nodeId);
      nodeId = node?.parentId ?? null;
    }

    // Also include all descendants of the current node (keep them)
    const collectDescendants = (id: number | string): void => {
      const node = gameTree.get(id);
      if (!node) return;
      for (const child of node.children) {
        pathToCurrentNode.add(child.id);
        collectDescendants(child.id);
      }
    };
    collectDescendants(currentNodeId);

    // Collect all nodes that need to be removed (siblings of nodes in the path)
    const nodesToRemove: (number | string)[] = [];

    // Walk the path and collect siblings that are not in the path
    let walkId: number | string | null = currentNodeId;
    while (walkId !== null) {
      const node = gameTree.get(walkId);
      if (!node || node.parentId === null) break;

      const parent = gameTree.get(node.parentId);
      if (parent) {
        for (const sibling of parent.children) {
          if (!pathToCurrentNode.has(sibling.id)) {
            nodesToRemove.push(sibling.id);
          }
        }
      }
      walkId = node.parentId;
    }

    if (nodesToRemove.length === 0) return;

    const newTree = gameTree.mutate(draft => {
      for (const id of nodesToRemove) {
        draft.removeNode(id);
      }
    });

    setGameTree(newTree);
    setIsDirty(true);
    boardCache.clear();
  }, [gameTree, currentNodeId, setGameTree, setIsDirty]);

  /**
   * Drop everything after the current node, keeping the current position
   * itself. Unlike deleteNode this does not re-attach anything — the
   * continuation is simply discarded, which is the sound way to "replay from
   * here". Splicing a node out of the middle of a line is deliberately not
   * offered: a move node is a board transition, so its descendants were
   * recorded on a position that no longer exists (see
   * specs/2026-09-24-gametree-branch-management.md).
   */
  const deleteContinuation = useCallback(() => {
    if (!gameTree || currentNodeId === null) return;

    const node = gameTree.get(currentNodeId);
    if (!node || node.children.length === 0) return;

    const childIds = node.children.map(child => child.id);
    const newTree = gameTree.mutate(draft => {
      for (const id of childIds) {
        draft.removeNode(id);
      }
    });

    setGameTree(newTree);
    setIsDirty(true);
    boardCache.clear();
  }, [gameTree, currentNodeId, setGameTree, setIsDirty]);

  return {
    copiedBranch,
    deleteNode,
    deleteContinuation,
    cutNode,
    copyNode,
    pasteNode,
    flattenVariations,
    makeMainVariation,
    shiftVariation,
    deleteOtherBranches,
  };
}

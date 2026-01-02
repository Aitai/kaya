/**
 * Performance Report Generation
 *
 * Functions for computing game performance metrics from AI analysis data.
 */

import type { AnalysisResult } from './types';
import {
  type MoveCategory,
  type GamePhase,
  type MoveStats,
  type MoveDistribution,
  type PhaseStats,
  type PlayerStats,
  type MistakeInfo,
  type TurningPoint,
  type GamePerformanceReport,
  type PerformanceReportOptions,
  type PointsLostThresholds,
  DEFAULT_POINTS_LOST_THRESHOLDS,
  DEFAULT_PHASE_THRESHOLDS,
} from './performance-types';

/**
 * Classify a move based on points lost
 */
export function classifyMove(
  pointsLost: number,
  thresholds: PointsLostThresholds = DEFAULT_POINTS_LOST_THRESHOLDS
): MoveCategory {
  if (pointsLost <= thresholds.aiMove) return 'aiMove';
  if (pointsLost <= thresholds.good) return 'good';
  if (pointsLost <= thresholds.inaccuracy) return 'inaccuracy';
  if (pointsLost <= thresholds.mistake) return 'mistake';
  return 'blunder';
}

/**
 * Get game phase for a move number
 */
export function getGamePhase(moveNumber: number, boardSize: number = 19): GamePhase {
  const thresholds = DEFAULT_PHASE_THRESHOLDS[boardSize] ?? DEFAULT_PHASE_THRESHOLDS[19];

  if (moveNumber <= thresholds.openingEnd) return 'opening';
  if (moveNumber <= thresholds.middleGameEnd) return 'middleGame';
  return 'endGame';
}

/**
 * Calculate points lost for a move
 *
 * @param prevScoreLead Score lead before the move (Black's perspective)
 * @param currScoreLead Score lead after the move (Black's perspective)
 * @param player Who played the move
 * @returns Points lost (always >= 0)
 */
export function calculatePointsLost(
  prevScoreLead: number,
  currScoreLead: number,
  player: 'B' | 'W'
): number {
  if (player === 'B') {
    // Black wants score to increase (or stay same)
    return Math.max(0, prevScoreLead - currScoreLead);
  } else {
    // White wants score to decrease (or stay same)
    return Math.max(0, currScoreLead - prevScoreLead);
  }
}

/**
 * Calculate points gained for a move (opponent's mistake recovery)
 */
export function calculatePointsGained(
  prevScoreLead: number,
  currScoreLead: number,
  player: 'B' | 'W'
): number {
  if (player === 'B') {
    // Black gains when score increases
    return Math.max(0, currScoreLead - prevScoreLead);
  } else {
    // White gains when score decreases
    return Math.max(0, prevScoreLead - currScoreLead);
  }
}

/**
 * Calculate win rate from score lead using tanh approximation
 * This matches KataGo's internal calculation
 */
export function scoreLeadToWinRate(scoreLead: number): number {
  return 0.5 + Math.tanh(scoreLead / 20) / 2;
}

/**
 * Find where a move ranks in the AI suggestions
 *
 * @returns Rank (1 = top move, 2 = second, etc.), or 0 if not in suggestions
 */
export function findMoveRank(move: string, suggestions: Array<{ move: string }>): number {
  const index = suggestions.findIndex(s => s.move.toUpperCase() === move.toUpperCase());
  return index >= 0 ? index + 1 : 0;
}

/**
 * Find the probability of a move in the AI suggestions
 */
export function findMoveProbability(
  move: string,
  suggestions: Array<{ move: string; probability: number }>
): number {
  const suggestion = suggestions.find(s => s.move.toUpperCase() === move.toUpperCase());
  return suggestion?.probability ?? 0;
}

/**
 * Create an empty move distribution
 */
export function createEmptyDistribution(): MoveDistribution {
  return {
    aiMove: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    total: 0,
  };
}

/**
 * Add a move category to a distribution
 */
export function addToDistribution(distribution: MoveDistribution, category: MoveCategory): void {
  distribution[category]++;
  distribution.total++;
}

/**
 * Calculate weighted accuracy from move stats
 */
export function calculateAccuracy(moves: MoveStats[]): number {
  if (moves.length === 0) return 0;

  let earnedWeight = 0;

  for (const move of moves) {
    switch (move.category) {
      case 'aiMove':
        earnedWeight += 1.0;
        break;
      case 'good':
        earnedWeight += 0.8;
        break;
      case 'inaccuracy':
        earnedWeight += 0.5;
        break;
      case 'mistake':
        earnedWeight += 0.2;
        break;
      case 'blunder':
        earnedWeight += 0.0;
        break;
    }
  }

  return (earnedWeight / moves.length) * 100;
}

/**
 * Input data for a single position in the game
 */
export interface PositionData {
  moveNumber: number;
  nodeId: string | number;
  player: 'B' | 'W';
  move: string; // GTP coordinate of the move played
  analysisBeforeMove: AnalysisResult | null; // Analysis of position before move
  analysisAfterMove: AnalysisResult | null; // Analysis of position after move
}

/**
 * Generate move statistics from position data
 */
export function generateMoveStats(
  position: PositionData,
  boardSize: number,
  thresholds: PointsLostThresholds
): MoveStats | null {
  const { moveNumber, nodeId, player, move, analysisBeforeMove, analysisAfterMove } = position;

  // Need analysis before move to calculate loss
  if (!analysisBeforeMove) {
    return null;
  }

  // Get score leads
  const scoreLeadBefore = analysisBeforeMove.scoreLead;
  const scoreLeadAfter = analysisAfterMove?.scoreLead ?? scoreLeadBefore;

  // Calculate points lost/gained
  const pointsLost = calculatePointsLost(scoreLeadBefore, scoreLeadAfter, player);
  const pointsGained = calculatePointsGained(scoreLeadBefore, scoreLeadAfter, player);

  // Win rates
  const winRateBefore = scoreLeadToWinRate(scoreLeadBefore);
  const winRateAfter = scoreLeadToWinRate(scoreLeadAfter);

  // Win rate swing from this player's perspective
  let winRateSwing: number;
  if (player === 'B') {
    winRateSwing = winRateAfter - winRateBefore;
  } else {
    winRateSwing = winRateBefore - winRateAfter; // White wants Black's win rate to drop
  }

  // Policy metrics
  const suggestions = analysisBeforeMove.moveSuggestions ?? [];
  const moveRank = findMoveRank(move, suggestions);
  const moveProbability = findMoveProbability(move, suggestions);
  const topMove = suggestions[0]?.move ?? '';
  const topMoveProbability = suggestions[0]?.probability ?? 0;
  const wasTopMove = moveRank === 1;

  // Classification
  const category = classifyMove(pointsLost, thresholds);
  const phase = getGamePhase(moveNumber, boardSize);

  return {
    moveNumber,
    nodeId,
    player,
    move,
    scoreLeadBefore,
    scoreLeadAfter,
    pointsLost,
    pointsGained,
    winRateBefore,
    winRateAfter,
    winRateSwing,
    moveRank,
    moveProbability,
    topMove,
    topMoveProbability,
    wasTopMove,
    category,
    phase,
  };
}

/**
 * Calculate phase statistics from moves
 */
export function calculatePhaseStats(
  moves: MoveStats[],
  phase: GamePhase,
  boardSize: number
): PhaseStats | null {
  const phaseMoves = moves.filter(m => m.phase === phase);

  if (phaseMoves.length === 0) return null;

  const moveNumbers = phaseMoves.map(m => m.moveNumber);
  const moveRange: [number, number] = [Math.min(...moveNumbers), Math.max(...moveNumbers)];

  const distribution = createEmptyDistribution();
  let totalPointsLost = 0;
  let totalPointsChange = 0;

  for (const move of phaseMoves) {
    addToDistribution(distribution, move.category);
    totalPointsLost += move.pointsLost;
    totalPointsChange += move.pointsGained - move.pointsLost;
  }

  return {
    phase,
    moveRange,
    moveCount: phaseMoves.length,
    accuracy: calculateAccuracy(phaseMoves),
    avgPointsPerMove: totalPointsChange / phaseMoves.length,
    meanLoss: totalPointsLost / phaseMoves.length,
    distribution,
  };
}

/**
 * Calculate player statistics from moves
 */
export function calculatePlayerStats(
  moves: MoveStats[],
  player: 'B' | 'W',
  playerName: string,
  boardSize: number
): PlayerStats {
  const playerMoves = moves.filter(m => m.player === player);

  const distribution = createEmptyDistribution();
  let totalPointsLost = 0;
  let totalPointsChange = 0;
  let topMoveCount = 0;
  let top5Count = 0;

  for (const move of playerMoves) {
    addToDistribution(distribution, move.category);
    totalPointsLost += move.pointsLost;
    totalPointsChange += move.pointsGained - move.pointsLost;

    if (move.wasTopMove) topMoveCount++;
    if (move.moveRank >= 1 && move.moveRank <= 5) top5Count++;
  }

  const totalMoves = playerMoves.length;

  return {
    player,
    playerName,
    totalMoves,
    accuracy: calculateAccuracy(playerMoves),
    bestMovePercentage: totalMoves > 0 ? (topMoveCount / totalMoves) * 100 : 0,
    top5Percentage: totalMoves > 0 ? (top5Count / totalMoves) * 100 : 0,
    avgPointsPerMove: totalMoves > 0 ? totalPointsChange / totalMoves : 0,
    meanLoss: totalMoves > 0 ? totalPointsLost / totalMoves : 0,
    totalPointsLost,
    distribution,
    byPhase: {
      opening: calculatePhaseStats(playerMoves, 'opening', boardSize),
      middleGame: calculatePhaseStats(playerMoves, 'middleGame', boardSize),
      endGame: calculatePhaseStats(playerMoves, 'endGame', boardSize),
    },
  };
}

/**
 * Find key mistakes in the game
 */
export function findKeyMistakes(moves: MoveStats[], maxCount: number = 10): MistakeInfo[] {
  // Filter to only mistakes and blunders, sort by points lost
  const mistakes = moves
    .filter(m => m.category === 'mistake' || m.category === 'blunder')
    .sort((a, b) => b.pointsLost - a.pointsLost)
    .slice(0, maxCount);

  return mistakes.map(m => ({
    moveNumber: m.moveNumber,
    nodeId: m.nodeId,
    player: m.player,
    playedMove: m.move,
    bestMove: m.topMove,
    pointsLost: m.pointsLost,
    category: m.category,
    winRateSwing: m.winRateSwing,
  }));
}

/**
 * Find turning points where advantage shifted significantly
 */
export function findTurningPoints(moves: MoveStats[], threshold: number = 5.0): TurningPoint[] {
  const turningPoints: TurningPoint[] = [];

  for (const move of moves) {
    const scoreSwing = Math.abs(move.scoreLeadAfter - move.scoreLeadBefore);

    if (scoreSwing >= threshold) {
      // Determine what happened
      let description: string;
      const wasLeadingBefore =
        (move.player === 'B' && move.scoreLeadBefore > 0) ||
        (move.player === 'W' && move.scoreLeadBefore < 0);
      const isLeadingAfter =
        (move.player === 'B' && move.scoreLeadAfter > 0) ||
        (move.player === 'W' && move.scoreLeadAfter < 0);

      if (!wasLeadingBefore && isLeadingAfter) {
        description = `${move.player === 'B' ? 'Black' : 'White'} takes the lead`;
      } else if (wasLeadingBefore && !isLeadingAfter) {
        description = `${move.player === 'B' ? 'Black' : 'White'} loses the lead`;
      } else if (move.pointsLost > 0) {
        description = `${move.player === 'B' ? 'Black' : 'White'} loses ${move.pointsLost.toFixed(1)} points`;
      } else {
        description = `${move.player === 'B' ? 'Black' : 'White'} gains ${move.pointsGained.toFixed(1)} points`;
      }

      turningPoints.push({
        moveNumber: move.moveNumber,
        nodeId: move.nodeId,
        player: move.player,
        description,
        scoreBefore: move.scoreLeadBefore,
        scoreAfter: move.scoreLeadAfter,
        scoreSwing,
      });
    }
  }

  // Sort by swing magnitude
  return turningPoints.sort((a, b) => b.scoreSwing - a.scoreSwing);
}

/**
 * Check if the game reached endgame phase
 */
export function checkReachedEndGame(totalMoves: number, boardSize: number): boolean {
  const thresholds = DEFAULT_PHASE_THRESHOLDS[boardSize] ?? DEFAULT_PHASE_THRESHOLDS[19];
  return totalMoves > thresholds.middleGameEnd;
}

/**
 * Game information for report generation
 */
export interface GameInfo {
  blackPlayer: string;
  whitePlayer: string;
  boardSize: number;
  komi: number;
  result: string;
}

/**
 * Generate a complete performance report
 */
export function generatePerformanceReport(
  positions: PositionData[],
  gameInfo: GameInfo,
  options: PerformanceReportOptions = {}
): GamePerformanceReport {
  const {
    thresholds: customThresholds,
    maxKeyMistakes = 10,
    turningPointThreshold = 5.0,
  } = options;

  const thresholds: PointsLostThresholds = {
    ...DEFAULT_POINTS_LOST_THRESHOLDS,
    ...customThresholds,
  };

  const { blackPlayer, whitePlayer, boardSize, komi, result } = gameInfo;

  // Generate move stats for all positions
  const moves: MoveStats[] = [];
  let analyzedCount = 0;

  for (const position of positions) {
    const stats = generateMoveStats(position, boardSize, thresholds);
    if (stats) {
      moves.push(stats);
      analyzedCount++;
    }
  }

  const totalMoves = positions.length;

  // Calculate player stats
  const black = calculatePlayerStats(moves, 'B', blackPlayer, boardSize);
  const white = calculatePlayerStats(moves, 'W', whitePlayer, boardSize);

  // Find key moments
  const keyMistakes = findKeyMistakes(moves, maxKeyMistakes);
  const turningPoints = findTurningPoints(moves, turningPointThreshold);

  return {
    generatedAt: new Date().toISOString(),
    blackPlayer,
    whitePlayer,
    boardSize,
    komi,
    result,
    totalMoves,
    analyzedMoves: analyzedCount,
    analysisComplete: analyzedCount === totalMoves,
    reachedEndGame: checkReachedEndGame(totalMoves, boardSize),
    black,
    white,
    keyMistakes,
    turningPoints,
    moves,
    thresholds,
  };
}

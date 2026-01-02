/**
 * Performance Report Types
 *
 * Types for analyzing game performance based on AI analysis data.
 */

/**
 * Move classification categories based on points lost
 */
export type MoveCategory = 'aiMove' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/**
 * Game phase based on move number
 */
export type GamePhase = 'opening' | 'middleGame' | 'endGame';

/**
 * Thresholds for classifying moves by points lost
 */
export interface PointsLostThresholds {
  aiMove: number; // <= this = AI move (default: 0.2)
  good: number; // <= this = good (default: 1.0)
  inaccuracy: number; // <= this = inaccuracy (default: 2.0)
  mistake: number; // <= this = mistake (default: 5.0)
  // > mistake = blunder
}

/**
 * Default thresholds for move classification
 */
export const DEFAULT_POINTS_LOST_THRESHOLDS: PointsLostThresholds = {
  aiMove: 0.2,
  good: 1.0,
  inaccuracy: 2.0,
  mistake: 5.0,
};

/**
 * Phase thresholds by board size (move numbers)
 */
export interface PhaseThresholds {
  openingEnd: number;
  middleGameEnd: number;
}

/**
 * Default phase thresholds by board size
 */
export const DEFAULT_PHASE_THRESHOLDS: Record<number, PhaseThresholds> = {
  19: { openingEnd: 50, middleGameEnd: 150 },
  13: { openingEnd: 30, middleGameEnd: 80 },
  9: { openingEnd: 15, middleGameEnd: 40 },
};

/**
 * Statistics for a single move
 */
export interface MoveStats {
  // Identification
  moveNumber: number;
  nodeId: string | number;
  player: 'B' | 'W';
  move: string; // GTP coordinate (e.g., "Q16")

  // Score metrics
  scoreLeadBefore: number; // Position before this move (Black's perspective)
  scoreLeadAfter: number; // Position after this move (Black's perspective)
  pointsLost: number; // Max(0, loss for this player)
  pointsGained: number; // Max(0, gain for this player)

  // Win rate metrics
  winRateBefore: number; // Black's win rate before
  winRateAfter: number; // Black's win rate after
  winRateSwing: number; // Change from this player's perspective

  // Policy metrics
  moveRank: number; // 1 = AI's top choice, 0 = not in top moves
  moveProbability: number; // Policy probability of played move
  topMove: string; // AI's recommended move
  topMoveProbability: number;
  wasTopMove: boolean; // Did player play AI's #1 choice?

  // Classification
  category: MoveCategory;
  phase: GamePhase;
}

/**
 * Move category distribution counts
 */
export interface MoveDistribution {
  aiMove: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  total: number;
}

/**
 * Statistics for a game phase
 */
export interface PhaseStats {
  phase: GamePhase;
  moveRange: [number, number]; // [start, end] move numbers (inclusive)
  moveCount: number;
  accuracy: number;
  avgPointsPerMove: number;
  meanLoss: number;
  distribution: MoveDistribution;
}

/**
 * Per-player aggregate statistics
 */
export interface PlayerStats {
  player: 'B' | 'W';
  playerName: string;
  totalMoves: number;

  // Accuracy metrics
  accuracy: number; // 0-100%
  bestMovePercentage: number; // % of AI top moves
  top5Percentage: number; // % in top 5

  // Points metrics
  avgPointsPerMove: number; // Can be + or -
  meanLoss: number; // Average of pointsLost (always >= 0)
  totalPointsLost: number;

  // Move distribution
  distribution: MoveDistribution;

  // Phase breakdown
  byPhase: {
    opening: PhaseStats | null;
    middleGame: PhaseStats | null;
    endGame: PhaseStats | null;
  };
}

/**
 * Information about a significant mistake
 */
export interface MistakeInfo {
  moveNumber: number;
  nodeId: string | number;
  player: 'B' | 'W';
  playedMove: string;
  bestMove: string;
  pointsLost: number;
  category: MoveCategory;
  winRateSwing: number;
}

/**
 * Information about a turning point in the game
 */
export interface TurningPoint {
  moveNumber: number;
  nodeId: string | number;
  player: 'B' | 'W';
  description: string; // e.g., "Advantage shifted to Black"
  scoreBefore: number;
  scoreAfter: number;
  scoreSwing: number;
}

/**
 * Complete game performance report
 */
export interface GamePerformanceReport {
  // Metadata
  generatedAt: string; // ISO timestamp

  // Game info
  blackPlayer: string;
  whitePlayer: string;
  boardSize: number;
  komi: number;
  result: string; // e.g., "B+R", "W+2.5"
  totalMoves: number;
  analyzedMoves: number;
  analysisComplete: boolean;

  // Game end info
  reachedEndGame: boolean;

  // Per-player stats
  black: PlayerStats;
  white: PlayerStats;

  // Key moments (sorted by impact)
  keyMistakes: MistakeInfo[]; // Top N biggest mistakes
  turningPoints: TurningPoint[]; // Where advantage shifted significantly

  // Full move breakdown
  moves: MoveStats[];

  // Configuration used
  thresholds: PointsLostThresholds;
}

/**
 * Options for generating a performance report
 */
export interface PerformanceReportOptions {
  /** Custom thresholds for move classification */
  thresholds?: Partial<PointsLostThresholds>;
  /** Maximum number of key mistakes to include */
  maxKeyMistakes?: number;
  /** Minimum points lost to be considered a turning point */
  turningPointThreshold?: number;
}

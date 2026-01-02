# Game Performance Report

Design document for implementing game performance analysis similar to KaTrain and AI-Sensei.

## Overview

The performance report analyzes a completed (or partially completed) game and provides insights into each player's move quality, accuracy, and key mistakes. This requires AI analysis data for each position in the game.

## Available Data from AI Engine

From each analyzed position, we have access to:

| Field                           | Type     | Description                                           |
| ------------------------------- | -------- | ----------------------------------------------------- |
| `scoreLead`                     | `number` | Score lead from Black's perspective (+ = Black ahead) |
| `winRate`                       | `number` | Black's win rate (0.0-1.0)                            |
| `moveSuggestions[]`             | `array`  | Ordered list of move suggestions                      |
| `moveSuggestions[].move`        | `string` | GTP coordinate (e.g., "Q16")                          |
| `moveSuggestions[].probability` | `number` | Policy network probability (0.0-1.0)                  |

---

## Core Metrics

### 1. Points Lost Per Move

The fundamental metric comparing score lead before and after each move.

```typescript
function calculatePointsLost(
  prevScoreLead: number, // Score lead BEFORE this move
  currScoreLead: number, // Score lead AFTER this move
  player: 'B' | 'W'
): number {
  // Score is always from Black's perspective
  // Black wants scoreLead to increase; White wants it to decrease

  if (player === 'B') {
    // Black played: loss = how much score decreased
    return Math.max(0, prevScoreLead - currScoreLead);
  } else {
    // White played: loss = how much score increased (worse for White)
    return Math.max(0, currScoreLead - prevScoreLead);
  }
}
```

**Note**: A move can also _gain_ points if the opponent previously made a mistake. We track this separately as `pointsGained`.

---

### 2. Move Classification

**Recommendation: Points-Lost Based Classification (Option B)**

We recommend using points lost as the primary classification metric because:

- More meaningful for game review ("you lost 5 points here")
- Consistent with KaTrain's approach
- Policy probability can be misleading (a 1% move might still be excellent in certain positions)

#### Classification Thresholds

| Category       | Points Lost | Color     | Description                             |
| -------------- | ----------- | --------- | --------------------------------------- |
| **AI Move**    | ≤ 0.2       | 🔵 Blue   | Matches or near-matches AI's top choice |
| **Good**       | ≤ 1.0       | 🟢 Green  | Solid move, minimal loss                |
| **Inaccuracy** | ≤ 2.0       | 🟡 Yellow | Suboptimal but not critical             |
| **Mistake**    | ≤ 5.0       | 🟠 Orange | Significant loss, should be reviewed    |
| **Blunder**    | > 5.0       | 🔴 Red    | Major error, likely game-changing       |

```typescript
type MoveCategory = 'aiMove' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

const POINTS_LOST_THRESHOLDS = {
  aiMove: 0.2,
  good: 1.0,
  inaccuracy: 2.0,
  mistake: 5.0,
};

function classifyMove(pointsLost: number): MoveCategory {
  if (pointsLost <= POINTS_LOST_THRESHOLDS.aiMove) return 'aiMove';
  if (pointsLost <= POINTS_LOST_THRESHOLDS.good) return 'good';
  if (pointsLost <= POINTS_LOST_THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (pointsLost <= POINTS_LOST_THRESHOLDS.mistake) return 'mistake';
  return 'blunder';
}
```

#### Alternative: Policy-Based Classification

For reference, policy-based classification uses the neural network's move probability:

| Category   | Criteria                      |
| ---------- | ----------------------------- |
| AI Move    | Rank 1 (top suggestion)       |
| Good       | Rank 2-5 OR probability ≥ 10% |
| Inaccuracy | Probability ≥ 1%              |
| Mistake    | Probability ≥ 0.1%            |
| Blunder    | Probability < 0.1%            |

**Why we don't recommend this as primary**: A low-probability move might still be excellent if it's a creative solution the AI didn't consider highly. Points lost is more objective.

---

### 3. Accuracy Calculation

**Recommendation: Weighted Accuracy (Option B)**

Simple "best move percentage" is too binary. A weighted approach gives credit for good (but not perfect) moves.

```typescript
function calculateAccuracy(moves: MoveStats[]): number {
  if (moves.length === 0) return 0;

  let totalWeight = 0;
  let earnedWeight = 0;

  for (const move of moves) {
    totalWeight += 1;

    const category = classifyMove(move.pointsLost);
    switch (category) {
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

  return (earnedWeight / totalWeight) * 100;
}
```

#### Additional Accuracy Metrics

| Metric              | Description                           |
| ------------------- | ------------------------------------- |
| **Accuracy %**      | Weighted score (0-100%)               |
| **Best Move %**     | Percentage of AI top moves played     |
| **Top 5 %**         | Percentage of moves in AI's top 5     |
| **Avg Points/Move** | Average points gained/lost per move   |
| **Mean Loss**       | Average points lost (excluding gains) |

---

### 4. Game Phase Detection

**Recommendation: Absolute Move Numbers (Option 1)**

Using percentage of total moves is unreliable because games can end early (resignation, timeout). Instead, use fixed move number thresholds based on board size.

#### Phase Thresholds by Board Size

| Board Size | Opening    | Middle Game  | Endgame    |
| ---------- | ---------- | ------------ | ---------- |
| 19×19      | Moves 1-50 | Moves 51-150 | Moves 151+ |
| 13×13      | Moves 1-30 | Moves 31-80  | Moves 81+  |
| 9×9        | Moves 1-15 | Moves 16-40  | Moves 41+  |

```typescript
interface PhaseThresholds {
  openingEnd: number;
  middleGameEnd: number;
}

const PHASE_THRESHOLDS: Record<number, PhaseThresholds> = {
  19: { openingEnd: 50, middleGameEnd: 150 },
  13: { openingEnd: 30, middleGameEnd: 80 },
  9: { openingEnd: 15, middleGameEnd: 40 },
};

function getPhase(moveNumber: number, boardSize: number = 19): GamePhase {
  const thresholds = PHASE_THRESHOLDS[boardSize] ?? PHASE_THRESHOLDS[19];

  if (moveNumber <= thresholds.openingEnd) return 'opening';
  if (moveNumber <= thresholds.middleGameEnd) return 'middleGame';
  return 'endGame';
}
```

#### Handling Early Game Endings

If a game ends before reaching a phase, that phase is marked as `null`:

```typescript
// Example: 70-move resignation on 19x19
phases: {
  opening: { moveRange: [1, 50], moveCount: 50, ... },
  middleGame: { moveRange: [51, 70], moveCount: 20, ... },
  endGame: null  // Game ended before endgame
}
```

---

## Data Structures

### MoveStats

Per-move statistics:

```typescript
interface MoveStats {
  // Identification
  moveNumber: number;
  nodeId: string | number;
  player: 'B' | 'W';
  move: string; // GTP coordinate (e.g., "Q16")

  // Score metrics
  scoreLeadBefore: number; // Position before this move
  scoreLeadAfter: number; // Position after this move
  pointsLost: number; // Max(0, loss for this player)
  pointsGained: number; // Max(0, gain for this player)

  // Win rate metrics
  winRateBefore: number;
  winRateAfter: number;
  winRateSwing: number; // Absolute change

  // Policy metrics
  moveRank: number; // 1 = AI's top choice, 2 = second, etc.
  moveProbability: number; // Policy probability of played move
  topMove: string; // AI's recommended move
  topMoveProbability: number;

  // Classification
  category: MoveCategory;
  phase: GamePhase;
}
```

### PlayerStats

Per-player aggregate statistics:

```typescript
interface PlayerStats {
  player: 'B' | 'W';
  playerName: string;
  totalMoves: number;

  // Accuracy metrics
  accuracy: number; // 0-100%
  bestMovePercentage: number; // % of AI top moves
  top5Percentage: number; // % in top 5

  // Points metrics
  avgPointsPerMove: number; // Can be + or -
  meanLoss: number; // Average of pointsLost
  totalPointsLost: number;

  // Move distribution
  distribution: {
    aiMove: number;
    good: number;
    inaccuracy: number;
    mistake: number;
    blunder: number;
  };

  // Phase breakdown
  byPhase: {
    opening: PhaseStats | null;
    middleGame: PhaseStats | null;
    endGame: PhaseStats | null;
  };
}
```

### PhaseStats

```typescript
interface PhaseStats {
  phase: GamePhase;
  moveRange: [number, number]; // [start, end] move numbers
  moveCount: number;
  accuracy: number;
  avgPointsPerMove: number;
  meanLoss: number;
  distribution: {
    aiMove: number;
    good: number;
    inaccuracy: number;
    mistake: number;
    blunder: number;
  };
}
```

### GamePerformanceReport

Complete report structure:

```typescript
interface GamePerformanceReport {
  // Metadata
  gameId: string;
  generatedAt: string; // ISO timestamp
  analysisComplete: boolean; // All moves analyzed?

  // Game info
  blackPlayer: string;
  whitePlayer: string;
  boardSize: number;
  komi: number;
  result: string; // e.g., "B+R", "W+2.5"
  totalMoves: number;
  analyzedMoves: number;

  // Game end info
  gameEndReason: 'completed' | 'resignation' | 'timeout' | 'unknown';
  reachedEndGame: boolean;

  // Per-player stats
  black: PlayerStats;
  white: PlayerStats;

  // Key moments (sorted by impact)
  keyMistakes: MistakeInfo[]; // Top N biggest mistakes
  turningPoints: TurningPoint[]; // Where advantage shifted

  // Full move breakdown
  moves: MoveStats[];
}

interface MistakeInfo {
  moveNumber: number;
  player: 'B' | 'W';
  playedMove: string;
  bestMove: string;
  pointsLost: number;
  category: MoveCategory;
  winRateSwing: number;
}

interface TurningPoint {
  moveNumber: number;
  player: 'B' | 'W';
  description: string; // e.g., "Advantage shifted to Black"
  scoreBefore: number;
  scoreAfter: number;
}
```

---

## UI Components

### Report Dialog/Panel

Main sections:

1. **Header**: Player names, result, game info
2. **Summary Cards**: Side-by-side accuracy & mean loss for both players
3. **Phase Tabs**: Entire Game | Opening | Middle Game | End Game
4. **Move Distribution Chart**: Bar chart showing category breakdown
5. **Points Distribution**: Histogram of moves by points lost buckets
6. **Key Mistakes List**: Clickable list to navigate to positions
7. **Detailed Move Table**: Sortable/filterable move-by-move data

### Visual Design

Reference the attached screenshots:

- **AI-Sensei style**: Clean, tabbed phases, side-by-side comparison
- **KaTrain style**: Dense stats, points distribution histogram

Recommended approach: Combine both - clean summary at top, detailed breakdown below.

---

## Implementation Plan

### Phase 1: Core Types & Logic (`packages/ai-engine`)

1. Create `src/performance-types.ts` - All TypeScript interfaces
2. Create `src/performance-report.ts` - Computation logic
3. Add unit tests in `tests/performance-report.test.ts`

### Phase 2: UI Components (`packages/ui`)

1. Create `src/components/analysis/PerformanceReport.tsx` - Main component
2. Create `src/components/analysis/PerformanceReport.css` - Styling
3. Add report button to analysis panel or game info
4. Implement navigation (click mistake → go to position)

### Phase 3: Integration

1. Add i18n keys for all labels (8 languages)
2. Add keyboard shortcut to open report
3. Responsive design for mobile/tablet
4. Export report as image/PDF (optional)

---

## Configuration Options

Allow users to customize thresholds:

```typescript
interface PerformanceReportSettings {
  // Classification thresholds
  thresholds: {
    aiMove: number; // default: 0.2
    good: number; // default: 1.0
    inaccuracy: number; // default: 2.0
    mistake: number; // default: 5.0
  };

  // Display options
  showPhaseBreakdown: boolean;
  showMoveDistribution: boolean;
  showKeyMistakes: number; // Top N mistakes to highlight

  // Comparison mode
  compareMode: 'vsOpponent' | 'vsAI';
}
```

---

## Future Enhancements

- **Pattern Recognition**: Identify common mistake patterns (ladder errors, ko fights, etc.)
- **Historical Tracking**: Compare performance across multiple games
- **Skill Estimation**: Estimate player rank based on accuracy
- **Opening Book Comparison**: Compare opening choices to professional games
- **Export/Share**: Generate shareable performance summary images

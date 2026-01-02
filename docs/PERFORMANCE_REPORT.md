# Game Performance Report

Documentation for the game performance analysis feature in Kaya.

## Overview

The performance report analyzes a completed (or partially completed) game and provides insights into each player's move quality, accuracy, and key mistakes. This requires AI analysis data for each position in the game.

## How It Works

Kaya uses **single-pass neural network inference** (no MCTS) for fast analysis. This means:

- Each position is evaluated once using KataGo's policy and value networks via ONNX Runtime
- Move quality is determined by **rank** and **relative probability** (not points lost)
- Score lead values can oscillate between positions, so they're not reliable for move-by-move comparison

---

## Move Classification

Moves are classified using a **rank + relative probability** system. The classification uses BOTH metrics and picks the **better** (less severe) category:

### Rank-Based Classification

| Category       | Rank Threshold | Description                    |
| -------------- | -------------- | ------------------------------ |
| **AI Move**    | Rank = 1       | Played AI's top choice         |
| **Good**       | Rank ≤ 3       | Among AI's top 3 suggestions   |
| **Inaccuracy** | Rank ≤ 10      | In AI's top 10 suggestions     |
| **Mistake**    | Rank ≤ 20      | In AI's top 20 suggestions     |
| **Blunder**    | Rank > 20      | Not in top suggestions or poor |

### Relative Probability Classification

Relative probability = (move probability) / (top move probability)

| Category       | Relative Probability | Description                            |
| -------------- | -------------------- | -------------------------------------- |
| **AI Move**    | ≥ 100%               | Same or better than top (rare)         |
| **Good**       | ≥ 50%                | At least half as likely as best move   |
| **Inaccuracy** | ≥ 10%                | Reasonable alternative                 |
| **Mistake**    | ≥ 2%                 | Low probability move                   |
| **Blunder**    | < 2%                 | Very unlikely move according to policy |

### Combined Classification

For each move, both rank and relative probability categories are calculated. The **better** (less severe) category is used. This prevents penalizing creative moves that may be ranked lower but have reasonable probability.

**Example**: A move ranked #5 with 40% relative probability:

- Rank-based: Inaccuracy (rank > 3)
- Probability-based: Good (40% < 50%, so Inaccuracy)
- Result: Inaccuracy

---

## Key Metrics

### Accuracy (%)

Weighted accuracy based on move categories:

| Category   | Weight |
| ---------- | ------ |
| AI Move    | 100%   |
| Good       | 80%    |
| Inaccuracy | 50%    |
| Mistake    | 20%    |
| Blunder    | 0%     |

```
Accuracy = (sum of weights for all moves) / (total moves) × 100
```

### Best Move Percentage (%)

Percentage of moves where the player played AI's #1 suggestion.

### Top 5 Percentage (%)

Percentage of moves where the player's move was among AI's top 5 suggestions. This is a useful metric because:

- It's less strict than "best move %"
- It captures moves that are strong alternatives
- More forgiving of style differences between humans and AI

---

## Game Phases

Phases are determined by absolute move number based on board size:

| Board Size | Opening    | Middle Game  | Endgame    |
| ---------- | ---------- | ------------ | ---------- |
| 19×19      | Moves 1-50 | Moves 51-150 | Moves 151+ |
| 13×13      | Moves 1-30 | Moves 31-80  | Moves 81+  |
| 9×9        | Moves 1-15 | Moves 16-40  | Moves 41+  |

The UI allows filtering all metrics by phase (Entire Game, Opening, Middle Game, Endgame).

---

## UI Components

### Tab Location

The Performance Report is available in the **Analysis Panel**, accessed via the "Report" tab next to the "Graph" tab.

### Summary Section

Side-by-side comparison for Black and White:

- **Accuracy**: Weighted accuracy percentage
- **Top 5 %**: Percentage of moves in AI's top 5 suggestions

### Move Distribution Chart

Horizontal bar chart showing the count of moves in each category for both players.

### Key Mistakes

List of the most significant mistakes (blunders and mistakes). Each item shows:

- Move number and coordinate
- Move rank and probability
- Clickable to navigate to that position

### Phase Filtering

Buttons to filter all displays by game phase:

- Entire Game (default)
- Opening
- Middle Game
- Endgame

### Help Modal

A help button (ⓘ) in the tab bar opens a modal explaining all metrics.

---

## Data Structures

### MoveStats

Per-move statistics:

```typescript
interface MoveStats {
  moveNumber: number;
  nodeId: string | number;
  player: 'B' | 'W';
  move: string; // GTP coordinate

  // Score metrics (from Black's perspective)
  scoreLeadBefore: number;
  scoreLeadAfter: number;
  pointsLost: number;
  pointsGained: number;

  // Win rate metrics
  winRateBefore: number;
  winRateAfter: number;
  winRateSwing: number;

  // Policy metrics (PRIMARY for classification)
  moveRank: number; // 1 = AI's top choice, 0 = not in suggestions
  moveProbability: number;
  topMove: string;
  topMoveProbability: number;
  wasTopMove: boolean;

  // Classification
  category: MoveCategory;
  phase: GamePhase;
}
```

### PhaseStats

Statistics for a game phase:

```typescript
interface PhaseStats {
  phase: GamePhase;
  moveRange: [number, number];
  moveCount: number;
  accuracy: number;
  avgPointsPerMove: number;
  meanLoss: number;
  bestMovePercentage: number;
  top5Percentage: number;
  distribution: MoveDistribution;
}
```

### GamePerformanceReport

Complete report structure:

```typescript
interface GamePerformanceReport {
  // Metadata
  generatedAt: string;
  analysisComplete: boolean;

  // Game info
  blackPlayer: string;
  whitePlayer: string;
  boardSize: number;
  komi: number;
  result: string;
  totalMoves: number;
  analyzedMoves: number;

  // Per-player stats
  black: PlayerStats;
  white: PlayerStats;

  // Key moments
  keyMistakes: MistakeInfo[];
  turningPoints: TurningPoint[];

  // Full move data
  moves: MoveStats[];

  // Configuration
  classificationThresholds: MoveClassificationThresholds;
}
```

---

## Classification Thresholds

Default thresholds (configurable):

```typescript
const DEFAULT_CLASSIFICATION_THRESHOLDS = {
  // Rank thresholds
  aiMoveMaxRank: 1,
  goodMaxRank: 3,
  inaccuracyMaxRank: 10,
  mistakeMaxRank: 20,

  // Relative probability thresholds
  goodMinRelativeProb: 0.5,
  inaccuracyMinRelativeProb: 0.1,
  mistakeMinRelativeProb: 0.02,
};
```

---

## Why Rank + Relative Probability?

Kaya's AI engine uses **single-pass inference** for speed. This differs from full KataGo analysis with MCTS which provides stable score estimates.

**Why not points lost?**

With single-pass inference, score lead values (`scoreLead`) can oscillate significantly between consecutive positions. This makes "points lost" unreliable for classifying individual moves.

**Why rank + probability?**

- **Rank**: Direct measure of how the move compares to AI's suggestions
- **Relative Probability**: Captures cases where a move is statistically reasonable even if not ranked first
- **Combined**: Takes the better of both, avoiding over-penalization

---

## Future Enhancements

- Pattern recognition for common mistakes
- Historical performance tracking
- Skill estimation based on accuracy
- Export/share performance summaries

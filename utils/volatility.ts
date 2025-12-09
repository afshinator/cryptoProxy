// Filename: src/utils/volatility.ts

import type { VolatilityLevel } from "../constants/VolatilityLevels.js";
import { log, TMI } from "./log.js";

// Volatility Utility specific emoji
const LOG_EMOJI = "⚡";

/**
 * Maps a single numerical volatility score (percentage) to a VolatilityLevel.
 * @param score - The numerical volatility score (e.g., 4.5).
 * @param bounds - The classification thresholds (1H or 24H).
 * @returns The corresponding VolatilityLevel string.
 */
function classifyVolatility(
  score: number,
  bounds: { LOW: number; NORMAL: number; HIGH: number }
): VolatilityLevel {
  if (score > bounds.HIGH) return "EXTREME";
  if (score > bounds.NORMAL) return "HIGH";
  if (score > bounds.LOW) return "NORMAL";
  return "LOW";
}

/**
 * Determines the single, decisive VolatilityLevel for the TTL calculation
 * by taking the most severe level from the 1H and 24H metrics.
 * @param vol1HScore - The calculated 1-Hour volatility score (e.g., 6.2).
 * @param vol24HScore - The calculated 24-Hour volatility score (e.g., 4.5).
 * @returns The single, most critical VolatilityLevel ('LOW' to 'EXTREME').
 */
export function getDecisiveVolatilityLevel(
  vol1HScore: number,
  vol24HScore: number
): VolatilityLevel {
  // Classification Thresholds based on your shared algorithm:
  const BOUNDS_1H = { LOW: 1.5, NORMAL: 4.0, HIGH: 8.0 };
  const BOUNDS_24H = { LOW: 2.0, NORMAL: 5.0, HIGH: 10.0 };

  const level1H = classifyVolatility(vol1HScore, BOUNDS_1H);
  const level24H = classifyVolatility(vol24HScore, BOUNDS_24H);

  log(`${LOG_EMOJI} Volatility 1H: ${vol1HScore}% -> ${level1H}`, TMI);
  log(`${LOG_EMOJI} Volatility 24H: ${vol24HScore}% -> ${level24H}`, TMI);

  // We map the levels to a numerical priority to easily pick the most severe (highest number).
  const levelPriority: Record<VolatilityLevel, number> = {
    LOW: 0,
    NORMAL: 1,
    HIGH: 2,
    EXTREME: 3,
  };

  if (levelPriority[level1H] > levelPriority[level24H]) {
    log(`${LOG_EMOJI} Decisive Level: ${level1H} (from 1H)`, TMI);
    return level1H;
  }

  log(`${LOG_EMOJI} Decisive Level: ${level24H} (from 24H)`, TMI);
  return level24H;
}

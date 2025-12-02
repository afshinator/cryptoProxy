// utils/log.ts

// Any log with priority > this number will be suppressed.
const LOG_THRESHOLD: number = 7;

// Exported constants for developers to use instead of magic numbers
export const ERR = 1;
export const ERR2 = 2;
export const WARN = 3;
export const WARN2 = 4;
export const LOG = 5;
export const LOG2 = 6;
export const INFO = 7;
export const INFO2 = 8;

/**
 * Logs a message to the console based on priority and a global threshold.
 * * @param message The string message to log.
 * @param priority Optional number (1-8) indicating the log's severity/type. Defaults to 5 (LOG).
 */
export function log(message: string, priority: number = LOG): void {
  // 1. Threshold Check: Suppress logs where priority is GREATER THAN the threshold.
  if (priority > LOG_THRESHOLD) {
    return;
  }

  // 2. Priority and Console Routing
  
  // Priority 1-2 (ERR, ERR2): Errors (console.error)
  if (priority >= ERR && priority <= ERR2) {
    console.error(`[P${priority}] ❌ ${message}`);
  } 
  // Priority 3-4 (WARN, WARN2): Warning Logs (console.warn)
  else if (priority >= WARN && priority <= WARN2) {
    console.warn(`[P${priority}] ⚠️ ${message}`);
  }
  // Priority 5-6 (LOG, LOG2): Default Logs (console.log)
  else if (priority >= LOG && priority <= LOG2) {
    console.log(`[P${priority}] ➖ ${message}`);
  }
  // Priority 7-8 (INFO, INFO2): Information Logs (console.info)
  else if (priority >= INFO && priority <= INFO2) {
    console.info(`[P${priority}] 📌 ${message}`);
  }
  // Handles logs outside the 1-8 range, but below the threshold (e.g., priority 0)
  else {
    console.warn(`[Invalid Priority ${priority}] ❗ ${message}`);
  }
}
/**
 * Suppresses DEP0169 deprecation warning from dependencies (url.parse() usage in @vercel/blob or its deps).
 * This warning is from a transitive dependency and cannot be fixed in our code.
 * We intercept stderr to filter out this specific deprecation warning message.
 * 
 * This function should be called at the module level (top-level) to ensure it runs before any dependencies
 * that might emit the warning.
 */
let stderrIntercepted = false;

export function suppressDeprecationWarning(): void {
  if (stderrIntercepted) {
    return; // Already intercepted
  }

  if (!process.stderr || typeof process.stderr.write !== 'function') {
    return; // stderr not available
  }

  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = function(chunk: any, encoding?: any, callback?: any): boolean {
    const message = typeof chunk === 'string' ? chunk : chunk.toString();
    // Filter out DEP0169 deprecation warnings
    if (message.includes('DEP0169') || message.includes('url.parse()')) {
      // Suppress this specific deprecation warning
      if (typeof callback === 'function') {
        callback();
      }
      return true;
    }
    // Pass through all other output
    return originalStderrWrite(chunk, encoding, callback);
  };
  
  stderrIntercepted = true;
}


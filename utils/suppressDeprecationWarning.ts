/**
 * Suppresses DEP0169 deprecation warning from dependencies (url.parse() usage in @vercel/blob or its deps).
 * This warning is from a transitive dependency and cannot be fixed in our code.
 * We intercept both process.emitWarning() (the proper way) and stderr to filter out this specific deprecation warning.
 * 
 * This function should be called at the module level (top-level) to ensure it runs before any dependencies
 * that might emit the warning.
 */
let warningIntercepted = false;

export function suppressDeprecationWarning(): void {
  if (warningIntercepted) {
    return; // Already intercepted
  }

  // Intercept process.emitWarning() - this is how Node.js emits deprecation warnings
  const originalEmitWarning = process.emitWarning.bind(process);
  // Use a type assertion to handle all overloads properly
  (process.emitWarning as any) = function(
    warning: string | Error,
    a?: string | Function | NodeJS.EmitWarningOptions,
    b?: string | Function,
    c?: Function
  ): typeof process {
    // Extract code from various parameter positions
    let code: string | undefined;
    
    // Handle different call signatures
    if (typeof a === 'object' && a !== null) {
      // Options object format: emitWarning(warning, { code: 'DEP0169' })
      code = (a as NodeJS.EmitWarningOptions).code;
    } else if (typeof b === 'string') {
      // Standard format: emitWarning(warning, type, code)
      code = b;
    }
    
    // Check if this is the DEP0169 deprecation warning
    if (code === 'DEP0169') {
      // Suppress this specific deprecation warning by not calling the original
      return process;
    }
    
    // Check if the warning message contains the deprecation info
    const warningMessage = typeof warning === 'string' ? warning : warning?.message || String(warning);
    if (warningMessage.includes('DEP0169') || warningMessage.includes('url.parse()')) {
      // Suppress this specific deprecation warning by not calling the original
      return process;
    }
    
    // Pass through all other warnings - reconstruct call based on arguments
    if (typeof a === 'object' && a !== null) {
      originalEmitWarning(warning, a as NodeJS.EmitWarningOptions);
    } else if (typeof b === 'string' && c !== undefined) {
      originalEmitWarning(warning, a as string, b, c);
    } else if (typeof b === 'string') {
      originalEmitWarning(warning, a as string, b);
    } else if (a !== undefined) {
      originalEmitWarning(warning, a as string);
    } else {
      originalEmitWarning(warning);
    }
    return process;
  };

  // Also intercept stderr.write as a fallback (in case warnings are written directly)
  if (process.stderr && typeof process.stderr.write === 'function') {
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
  }
  
  warningIntercepted = true;
}


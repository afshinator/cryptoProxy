import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Test to ensure that url.parse() is not used anywhere in the codebase.
 * 
 * This test scans all TypeScript files and checks for:
 * 1. Direct usage of url.parse()
 * 2. require('url').parse
 * 3. import ... from 'url' followed by parse usage
 * 
 * The deprecated url.parse() should be replaced with the WHATWG URL API.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

// Directories to exclude from scanning
const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', '.vercel'];
// Files to exclude from scanning (test file itself, and files that mention url.parse() in comments/strings)
const EXCLUDE_FILES = ['urlParse.test.ts'];
// File extensions to scan
const SCAN_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx'];

interface Violation {
  file: string;
  line: number;
  content: string;
  type: 'direct_call' | 'require' | 'import_usage';
}

/**
 * Recursively get all TypeScript/JavaScript files in a directory
 */
function getAllSourceFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];
  
  try {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relativePath = fullPath.replace(baseDir + '/', '');
      
      // Skip excluded directories
      if (EXCLUDE_DIRS.some(excluded => relativePath.includes(excluded))) {
        continue;
      }
      
      try {
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...getAllSourceFiles(fullPath, baseDir));
        } else if (stat.isFile()) {
          const ext = extname(entry);
          // Skip excluded files
          if (EXCLUDE_FILES.some(excluded => entry.includes(excluded))) {
            continue;
          }
          if (SCAN_EXTENSIONS.includes(ext)) {
            files.push(fullPath);
          }
        }
      } catch (err) {
        // Skip files we can't access
        continue;
      }
    }
  } catch (err) {
    // Skip directories we can't access
  }
  
  return files;
}

/**
 * Check a file for url.parse() usage
 */
function checkFileForUrlParse(filePath: string): Violation[] {
  const violations: Violation[] = [];
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    let hasUrlImport = false;
    let urlImportLine = -1;
    
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmedLine = line.trim();
      
      // Skip comments and strings (basic check)
      if (trimmedLine.startsWith('//') || 
          trimmedLine.startsWith('*') ||
          trimmedLine.startsWith('/*')) {
        return;
      }
      
      // Check for direct url.parse() calls
      // Match: url.parse( but NOT in strings, comments, or error messages
      const directCallRegex = /\burl\.parse\s*\(/;
      if (directCallRegex.test(line)) {
        // Skip if it's in a string literal (check if url.parse is between quotes)
        const urlParseIndex = line.indexOf('url.parse');
        if (urlParseIndex !== -1) {
          // Check if it's inside quotes
          const beforeMatch = line.substring(0, urlParseIndex);
          const afterMatch = line.substring(urlParseIndex);
          const singleQuotesBefore = (beforeMatch.match(/'/g) || []).length;
          const doubleQuotesBefore = (beforeMatch.match(/"/g) || []).length;
          const backticksBefore = (beforeMatch.match(/`/g) || []).length;
          const singleQuotesAfter = (afterMatch.match(/'/g) || []).length;
          const doubleQuotesAfter = (afterMatch.match(/"/g) || []).length;
          const backticksAfter = (afterMatch.match(/`/g) || []).length;
          
          // If odd number of quotes before and after, it's inside a string
          const inSingleQuotes = singleQuotesBefore % 2 === 1 && singleQuotesAfter % 2 === 1;
          const inDoubleQuotes = doubleQuotesBefore % 2 === 1 && doubleQuotesAfter % 2 === 1;
          const inBackticks = backticksBefore % 2 === 1 && backticksAfter % 2 === 1;
          
          // Skip if in comment
          const commentIndex = line.indexOf('//');
          const inComment = commentIndex !== -1 && commentIndex < urlParseIndex;
          
          if (!inSingleQuotes && !inDoubleQuotes && !inBackticks && !inComment) {
            violations.push({
              file: filePath,
              line: lineNum,
              content: trimmedLine,
              type: 'direct_call'
            });
          }
        }
      }
      
      // Check for require('url').parse
      const requireRegex = /require\s*\(\s*['"]url['"]\s*\)\s*\.\s*parse/;
      if (requireRegex.test(line)) {
        violations.push({
          file: filePath,
          line: lineNum,
          content: trimmedLine,
          type: 'require'
        });
      }
      
      // Check for import from 'url' that might be used for parse
      const importUrlRegex = /import\s+.*\s+from\s+['"]url['"]/;
      if (importUrlRegex.test(line)) {
        hasUrlImport = true;
        urlImportLine = lineNum;
      }
      
      // If we have a url import, check for parse usage
      if (hasUrlImport) {
        // Check for destructured parse from url: { parse } or parse as alias
        // Only flag if parse is actually imported from url module
        const parseFromUrlRegex = /import\s+.*\{[^}]*parse[^}]*\}\s+from\s+['"]url['"]/;
        if (parseFromUrlRegex.test(line)) {
          violations.push({
            file: filePath,
            line: lineNum,
            content: trimmedLine,
            type: 'import_usage'
          });
        }
        
        // Check for parse( calls after url import - but only if parse was imported
        // We need to track if parse was actually imported
        const parseImportedRegex = /import\s+.*\{[^}]*\bparse\b[^}]*\}\s+from\s+['"]url['"]/;
        if (parseImportedRegex.test(line)) {
          // Track that parse was imported from url
          let parseImported = true;
          // Check subsequent lines for parse( usage (but not JSON.parse or other parse methods)
          for (let i = index + 1; i < Math.min(index + 50, lines.length); i++) {
            const subsequentLine = lines[i];
            const subsequentTrimmed = subsequentLine.trim();
            
            // Skip comments
            if (subsequentTrimmed.startsWith('//') || subsequentTrimmed.startsWith('*')) {
              continue;
            }
            
            // Check for parse( calls that are NOT JSON.parse, Buffer.parse, etc.
            const parseCallRegex = /(?:^|[^a-zA-Z0-9_])\bparse\s*\(/;
            if (parseCallRegex.test(subsequentLine) && 
                !subsequentLine.includes('JSON.parse') &&
                !subsequentLine.includes('Buffer.parse') &&
                !subsequentLine.includes('Date.parse') &&
                !subsequentLine.includes('Number.parse') &&
                !subsequentLine.includes('Intl.NumberFormat.prototype.parse')) {
              violations.push({
                file: filePath,
                line: i + 1,
                content: subsequentTrimmed,
                type: 'import_usage'
              });
              break; // Only flag first usage
            }
          }
        }
      }
    });
  } catch (err) {
    // Skip files we can't read
  }
  
  return violations;
}

describe('url.parse() usage check', () => {
  it('should not use url.parse() anywhere in the codebase', () => {
    const projectRoot = join(__dirname, '..');
    const sourceFiles = getAllSourceFiles(projectRoot);
    
    const allViolations: Violation[] = [];
    
    for (const file of sourceFiles) {
      const violations = checkFileForUrlParse(file);
      allViolations.push(...violations);
    }
    
    if (allViolations.length > 0) {
      const violationMessages = allViolations.map(v => {
        const relativePath = v.file.replace(projectRoot + '/', '');
        return `  ${relativePath}:${v.line} (${v.type})\n    ${v.content}`;
      }).join('\n');
      
      expect.fail(
        `Found ${allViolations.length} usage(s) of deprecated url.parse():\n\n${violationMessages}\n\n` +
        `Please replace url.parse() with the WHATWG URL API:\n` +
        `  - Instead of: url.parse(urlString)\n` +
        `  - Use: new URL(urlString)\n` +
        `  - Or: new URL(urlString, base) for relative URLs`
      );
    }
    
    // If we get here, no violations were found
    expect(allViolations.length).toBe(0);
  });
  
  it('should verify that suppressDeprecationWarning handles url.parse() warnings', () => {
    // This test ensures our suppression utility is aware of url.parse() warnings
    const projectRoot = join(__dirname, '..');
    const suppressFile = join(projectRoot, 'utils', 'suppressDeprecationWarning.ts');
    const content = readFileSync(suppressFile, 'utf-8');
    
    // Check that the suppression utility mentions url.parse()
    expect(content).toContain('url.parse()');
    expect(content).toContain('DEP0169');
    expect(content).toContain('process.emitWarning');
  });
});


// Enhanced JSON analyzer utility to identify and fix control character issues

const analyzeJsonError = (jsonString, parseError) => {
    const lines = jsonString.split('\n');
    const errorInfo = {
      message: parseError.message,
      suggestions: [],
      problematicContent: null,
      fixedContent: null
    };
  
    console.log('🔍 Analyzing JSON error:', parseError.message);
  
    // Extract position information
    const positionMatch = parseError.message.match(/position (\d+)/i);
    const lineMatch = parseError.message.match(/line (\d+)/i);
    const columnMatch = parseError.message.match(/column (\d+)/i);
    
    if (positionMatch) {
      const position = parseInt(positionMatch[1]);
      errorInfo.position = position;
      
      // Find the problematic character
      const problematicChar = jsonString[position];
      const charCode = problematicChar ? problematicChar.charCodeAt(0) : null;
      
      console.log('❌ Problematic character details:', {
        character: problematicChar,
        charCode: charCode,
        position: position
      });
  
      errorInfo.problematicChar = {
        char: problematicChar,
        code: charCode,
        description: getCharacterDescription(charCode)
      };
    }
  
    if (lineMatch && columnMatch) {
      const lineNum = parseInt(lineMatch[1]) - 1; // Convert to 0-based
      const columnNum = parseInt(columnMatch[1]) - 1;
      
      if (lineNum < lines.length) {
        const problematicLine = lines[lineNum];
        const contextStart = Math.max(0, lineNum - 2);
        const contextEnd = Math.min(lines.length, lineNum + 3);
        
        errorInfo.line = lineNum + 1;
        errorInfo.column = columnNum + 1;
        errorInfo.problematicLine = problematicLine;
        errorInfo.context = lines.slice(contextStart, contextEnd).map((line, idx) => ({
          lineNumber: contextStart + idx + 1,
          content: line,
          isProblematic: contextStart + idx === lineNum
        }));
  
        console.log('📍 Error location context:');
        errorInfo.context.forEach(line => {
          const marker = line.isProblematic ? '>>> ' : '    ';
          console.log(`${marker}${line.lineNumber}: ${line.content}`);
        });
  
        // Show character at specific column
        if (columnNum < problematicLine.length) {
          const charAtColumn = problematicLine[columnNum];
          const charCode = charAtColumn ? charAtColumn.charCodeAt(0) : null;
          
          console.log('🎯 Character at error position:', {
            character: charAtColumn,
            charCode: charCode,
            description: getCharacterDescription(charCode)
          });
        }
      }
    }
  
    // Analyze the type of error and provide suggestions
    if (parseError.message.includes('Bad control character')) {
      errorInfo.suggestions.push('Remove or properly escape control characters (line breaks, tabs, etc.)');
      errorInfo.suggestions.push('Use \\n for line breaks, \\t for tabs, \\r for carriage returns');
      errorInfo.suggestions.push('Check for invisible characters copied from other sources');
      
      // Try to fix common control character issues
      errorInfo.fixedContent = fixControlCharacters(jsonString);
    }
    
    if (parseError.message.includes('Unexpected token')) {
      errorInfo.suggestions.push('Check for missing commas, extra commas, or incorrect brackets/braces');
      errorInfo.suggestions.push('Ensure all strings are properly quoted with double quotes');
      errorInfo.suggestions.push('Verify that all object and array structures are properly closed');
    }
    
    if (parseError.message.includes('Unexpected end')) {
      errorInfo.suggestions.push('Check for missing closing brackets ] or braces }');
      errorInfo.suggestions.push('Ensure the JSON structure is complete');
    }
  
    return errorInfo;
  };
  
  const getCharacterDescription = (charCode) => {
    if (!charCode) return 'Unknown character';
    
    const descriptions = {
      8: 'Backspace (\\b)',
      9: 'Tab (\\t)',
      10: 'Line Feed/New Line (\\n)',
      11: 'Vertical Tab (\\v)',
      12: 'Form Feed (\\f)',
      13: 'Carriage Return (\\r)',
      32: 'Space',
      34: 'Double Quote (")',
      39: 'Single Quote (\')',
      92: 'Backslash (\\)',
    };
  
    if (descriptions[charCode]) {
      return descriptions[charCode];
    }
    
    if (charCode >= 0 && charCode <= 31) {
      return `Control character (ASCII ${charCode})`;
    }
    
    if (charCode >= 32 && charCode <= 126) {
      return `Printable ASCII character (${String.fromCharCode(charCode)})`;
    }
    
    return `Unicode character (code ${charCode})`;
  };
  
  const fixControlCharacters = (jsonString) => {
    console.log('🛠️ Attempting to fix control characters...');
    
    let fixed = jsonString;
    let changesMade = [];
    
    // Replace common problematic control characters
    const replacements = [
      { regex: /\r\n/g, replacement: '\\n', description: 'Windows line endings (\\r\\n)' },
      { regex: /\r/g, replacement: '\\n', description: 'Mac line endings (\\r)' },
      { regex: /\n/g, replacement: '\\n', description: 'Unix line endings (\\n)' },
      { regex: /\t/g, replacement: '\\t', description: 'Tab characters' },
      { regex: /\f/g, replacement: '\\f', description: 'Form feed characters' },
      { regex: /\v/g, replacement: '\\v', description: 'Vertical tab characters' },
      { regex: /\b/g, replacement: '\\b', description: 'Backspace characters' }
    ];
    
    replacements.forEach(({ regex, replacement, description }) => {
      const matches = fixed.match(regex);
      if (matches && matches.length > 0) {
        fixed = fixed.replace(regex, replacement);
        changesMade.push(`${description}: ${matches.length} instances`);
      }
    });
    
    // Remove other control characters (ASCII 0-31 except those handled above)
    const controlCharRegex = /[\x00-\x08\x0E-\x1F]/g;
    const controlMatches = fixed.match(controlCharRegex);
    if (controlMatches && controlMatches.length > 0) {
      fixed = fixed.replace(controlCharRegex, '');
      changesMade.push(`Other control characters: ${controlMatches.length} removed`);
    }
    
    if (changesMade.length > 0) {
      console.log('✅ Control character fixes applied:', changesMade);
    } else {
      console.log('ℹ️ No obvious control character issues found');
    }
    
    return fixed;
  };
  
  // Function to validate and clean JSON
  const cleanAndValidateJson = (jsonString) => {
    console.log('🧹 Starting JSON cleaning and validation...');
    
    try {
      // First, try to parse as-is
      const parsed = JSON.parse(jsonString);
      console.log('✅ JSON is already valid');
      return { success: true, data: parsed, original: jsonString };
    } catch (error) {
      console.log('⚠️ JSON parsing failed, attempting to fix...');
      
      // Analyze the error
      const analysis = analyzeJsonError(jsonString, error);
      
      // Try to fix the JSON
      const fixedJson = analysis.fixedContent || jsonString;
      
      try {
        const parsed = JSON.parse(fixedJson);
        console.log('✅ JSON fixed successfully');
        return { 
          success: true, 
          data: parsed, 
          original: jsonString,
          fixed: fixedJson,
          analysis: analysis
        };
      } catch (secondError) {
        console.log('❌ Unable to automatically fix JSON');
        return { 
          success: false, 
          error: error,
          secondError: secondError,
          analysis: analysis,
          original: jsonString,
          attempted: fixedJson
        };
      }
    }
  };
  
  module.exports = {
    analyzeJsonError,
    getCharacterDescription,
    fixControlCharacters,
    cleanAndValidateJson
  };
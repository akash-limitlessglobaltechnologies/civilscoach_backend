// Enhanced Validation utility functions with optional fields support

const validateTestData = (jsonData) => {
  const errors = [];
  const warnings = [];

  // Check if jsonData exists and is an object
  if (!jsonData || typeof jsonData !== 'object') {
    errors.push('Invalid JSON structure: Expected an object');
    return { errors, warnings };
  }

  console.log('🔍 Validating JSON data structure:', {
    hasYear: !!jsonData.year,
    hasPaper: !!jsonData.paper,
    hasQuestions: !!jsonData.questions,
    questionsLength: jsonData.questions?.length,
    hasTimeInMins: !!jsonData.timeInMins,
    hasCutoff: !!jsonData.cutoff,
    hasNumberOfQuestions: !!jsonData.numberOfQuestions
  });

  // Validate required top-level fields
  if (!jsonData.year || typeof jsonData.year !== 'number') {
    errors.push('Year is required and must be a number');
  } else if (jsonData.year < 2000 || jsonData.year > 2035) {
    errors.push('Year must be between 2000 and 2035');
  }

  if (!jsonData.paper || typeof jsonData.paper !== 'string' || jsonData.paper.trim().length === 0) {
    errors.push('Paper is required and must be a non-empty string');
  } else if (jsonData.paper.trim().length > 100) {
    errors.push('Paper name cannot exceed 100 characters');
  }

  // Validate questions array (required)
  if (!jsonData.questions || !Array.isArray(jsonData.questions)) {
    errors.push('Questions array is required and must be an array');
    return { errors, warnings }; // Stop validation if questions array is missing
  }

  if (jsonData.questions.length === 0) {
    errors.push('At least one question is required');
    return { errors, warnings };
  }

  if (jsonData.questions.length > 500) {
    errors.push('Maximum 500 questions allowed');
  }

  // Validate or set numberOfQuestions (make it optional, derive from questions array)
  if (jsonData.numberOfQuestions) {
    if (typeof jsonData.numberOfQuestions !== 'number') {
      errors.push('Number of questions must be a number if provided');
    } else if (jsonData.numberOfQuestions !== jsonData.questions.length) {
      warnings.push(`Number of questions field (${jsonData.numberOfQuestions}) doesn't match questions array length (${jsonData.questions.length}). Using array length.`);
      jsonData.numberOfQuestions = jsonData.questions.length;
    }
  } else {
    jsonData.numberOfQuestions = jsonData.questions.length;
    warnings.push(`Number of questions not provided, auto-calculated as ${jsonData.numberOfQuestions}`);
  }

  // Validate or set default timeInMins (make it optional with default)
  if (jsonData.timeInMins) {
    if (typeof jsonData.timeInMins !== 'number') {
      errors.push('Time in minutes must be a number if provided');
    } else if (jsonData.timeInMins < 1 || jsonData.timeInMins > 600) {
      errors.push('Time must be between 1 and 600 minutes');
    }
  } else {
    // Auto-calculate based on questions: 1.5 minutes per question, minimum 30 minutes
    const calculatedTime = Math.max(30, Math.ceil(jsonData.questions.length * 1.5));
    jsonData.timeInMins = Math.min(calculatedTime, 180); // Cap at 3 hours
    warnings.push(`Time not provided, auto-calculated as ${jsonData.timeInMins} minutes`);
  }

  // Validate or set default cutoff (make it optional with defaults)
  if (jsonData.cutoff) {
    if (typeof jsonData.cutoff !== 'object') {
      errors.push('Cutoff must be an object if provided');
    } else {
      const requiredCategories = ['Gen', 'EWS', 'OBC', 'SC', 'ST'];
      const providedCategories = Object.keys(jsonData.cutoff);
      
      for (const category of requiredCategories) {
        if (!(category in jsonData.cutoff)) {
          // Set default cutoff to 30% of total questions
          const defaultCutoff = Math.round(jsonData.questions.length * 0.3);
          jsonData.cutoff[category] = defaultCutoff;
          warnings.push(`Cutoff for ${category} not provided, set to default: ${defaultCutoff}`);
        } else if (typeof jsonData.cutoff[category] !== 'number') {
          errors.push(`Cutoff for ${category} must be a number`);
        } else if (jsonData.cutoff[category] < 0) {
          errors.push(`Cutoff for ${category} cannot be negative`);
        }
      }
    }
  } else {
    // Set default cutoffs (30% for Gen/EWS, 25% for OBC, 20% for SC/ST)
    const baseScore = jsonData.questions.length;
    jsonData.cutoff = {
      Gen: Math.round(baseScore * 0.30),
      EWS: Math.round(baseScore * 0.30),
      OBC: Math.round(baseScore * 0.25),
      SC: Math.round(baseScore * 0.20),
      ST: Math.round(baseScore * 0.20)
    };
    warnings.push('Cutoff not provided, using default values based on 30%/30%/25%/20%/20%');
  }

  console.log('📊 After validation/auto-fill:', {
    numberOfQuestions: jsonData.numberOfQuestions,
    timeInMins: jsonData.timeInMins,
    cutoff: jsonData.cutoff
  });

  // Validate each question
  jsonData.questions.forEach((question, index) => {
    const questionPrefix = `Question ${index + 1}`;

    // Question text (required)
    if (!question.question || typeof question.question !== 'string' || question.question.trim().length === 0) {
      errors.push(`${questionPrefix}: Question text is required and cannot be empty`);
    } else if (question.question.length > 2000) {
      errors.push(`${questionPrefix}: Question text cannot exceed 2000 characters`);
    }

    // Difficulty (optional with default)
    if (question.difficulty) {
      const validDifficulties = ['Easy', 'Medium', 'Hard'];
      if (!validDifficulties.includes(question.difficulty)) {
        errors.push(`${questionPrefix}: Difficulty must be one of: ${validDifficulties.join(', ')}`);
      }
    } else {
      question.difficulty = 'Medium'; // Default difficulty
      warnings.push(`${questionPrefix}: Difficulty not provided, set to default: Medium`);
    }

    // Area/Subject (optional with default)
    if (question.area) {
      if (typeof question.area !== 'string') {
        errors.push(`${questionPrefix}: Area must be a string`);
      } else if (question.area.length > 100) {
        errors.push(`${questionPrefix}: Area cannot exceed 100 characters`);
      }
    } else {
      question.area = 'General'; // Default area
      warnings.push(`${questionPrefix}: Area not provided, set to default: General`);
    }

    // Validate options (A, B, C, D) - required
    const requiredOptions = ['OptionA', 'OptionB', 'OptionC', 'OptionD'];
    const missingOptions = [];
    
    for (const optionKey of requiredOptions) {
      if (!question[optionKey] || typeof question[optionKey] !== 'string' || question[optionKey].trim().length === 0) {
        missingOptions.push(optionKey);
      } else if (question[optionKey].length > 1000) {
        errors.push(`${questionPrefix}: ${optionKey} text cannot exceed 1000 characters`);
      }
    }

    if (missingOptions.length > 0) {
      errors.push(`${questionPrefix}: Missing or empty options: ${missingOptions.join(', ')}`);
    }

    // Validate key (correct answer) - required
    if (!question.key || typeof question.key !== 'string') {
      errors.push(`${questionPrefix}: Key (correct answer) is required`);
    } else {
      const validKeys = ['A', 'B', 'C', 'D'];
      if (!validKeys.includes(question.key)) {
        errors.push(`${questionPrefix}: Key must be one of: A, B, C, D (provided: "${question.key}")`);
      }
    }

    // Explanation (optional)
    if (question.explanation) {
      if (typeof question.explanation !== 'string') {
        errors.push(`${questionPrefix}: Explanation must be a string`);
      } else if (question.explanation.length > 2000) {
        errors.push(`${questionPrefix}: Explanation cannot exceed 2000 characters`);
      }
    } else {
      question.explanation = ''; // Set empty explanation if not provided
    }

    // Auto-generate QID if not provided
    if (!question.qid) {
      question.qid = `${jsonData.year}_${jsonData.paper.replace(/\s+/g, '')}_Q${index + 1}`;
      warnings.push(`${questionPrefix}: QID auto-generated: ${question.qid}`);
    }
  });

  console.log('✅ Validation complete:', {
    errorsCount: errors.length,
    warningsCount: warnings.length,
    errors: errors,
    warnings: warnings
  });

  return { errors, warnings };
};

const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

const validateTestName = (name) => {
  if (!name || typeof name !== 'string') {
    return false;
  }
  return name.trim().length >= 3 && name.trim().length <= 200;
};

const validateDuration = (duration) => {
  const num = parseFloat(duration);
  return !isNaN(num) && num >= 1 && num <= 600;
};

// Enhanced function to convert new format to old format with better error handling
const convertToLegacyFormat = (newFormatData) => {
  try {
    console.log('🔄 Converting to legacy format...');
    
    const legacyFormat = {
      year: newFormatData.year,
      paper: newFormatData.paper.trim(),
      numberOfQuestions: newFormatData.numberOfQuestions,
      timeInMins: newFormatData.timeInMins,
      cutoff: newFormatData.cutoff,
      questions: newFormatData.questions.map((q, index) => {
        const legacyQuestion = {
          qid: q.qid || `${newFormatData.year}_${newFormatData.paper.replace(/\s+/g, '')}_Q${index + 1}`,
          question: q.question.trim(),
          options: [
            { key: 'A', text: q.OptionA.trim(), correct: q.key === 'A' },
            { key: 'B', text: q.OptionB.trim(), correct: q.key === 'B' },
            { key: 'C', text: q.OptionC.trim(), correct: q.key === 'C' },
            { key: 'D', text: q.OptionD.trim(), correct: q.key === 'D' }
          ],
          explanation: q.explanation || '',
          difficulty: q.difficulty || 'Medium',
          area: q.area || 'General'
        };

        return legacyQuestion;
      })
    };

    console.log('✅ Legacy format conversion complete:', {
      questionsConverted: legacyFormat.questions.length,
      year: legacyFormat.year,
      paper: legacyFormat.paper,
      timeInMins: legacyFormat.timeInMins
    });

    return legacyFormat;
  } catch (error) {
    console.error('❌ Error converting to legacy format:', error);
    throw new Error(`Failed to convert data format: ${error.message}`);
  }
};

// Function to analyze and provide detailed JSON error information
const analyzeJsonError = (jsonString, parseError) => {
  const lines = jsonString.split('\n');
  const errorInfo = {
    message: parseError.message,
    suggestions: []
  };

  // Try to extract line number from error message
  const lineMatch = parseError.message.match(/line (\d+)/i) || parseError.message.match(/position (\d+)/i);
  
  if (lineMatch) {
    const position = parseInt(lineMatch[1]);
    errorInfo.line = Math.min(position, lines.length);
    errorInfo.context = lines.slice(Math.max(0, position - 3), Math.min(lines.length, position + 2));
  }

  // Common JSON errors and suggestions
  if (parseError.message.includes('Unexpected token')) {
    errorInfo.suggestions.push('Check for missing commas, extra commas, or incorrect brackets/braces');
    errorInfo.suggestions.push('Ensure all strings are properly quoted with double quotes');
  }
  
  if (parseError.message.includes('Unexpected end')) {
    errorInfo.suggestions.push('Check for missing closing brackets ] or braces }');
    errorInfo.suggestions.push('Ensure the JSON structure is complete');
  }

  return errorInfo;
};

module.exports = {
  validateTestData,
  validateEmail,
  validateTestName,
  validateDuration,
  convertToLegacyFormat,
  analyzeJsonError
};
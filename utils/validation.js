// Flexible Validation utility functions with area and subarea support

// Area mapping for validation
const AREA_MAPPING = {
  1: 'Current Affairs',
  2: 'History',
  3: 'Polity',
  4: 'Economy',
  5: 'Geography',
  6: 'Ecology',
  7: 'General Science',
  8: 'Arts & Culture'
};

// Helper function to get area number from name (case-insensitive)
const getAreaNumberFromName = (areaName) => {
  if (typeof areaName === 'number' && areaName >= 1 && areaName <= 8) {
    return areaName; // Already a valid number
  }
  
  if (typeof areaName === 'string') {
    const lowerName = areaName.toLowerCase().trim();
    
    // Direct mapping
    const mappingEntries = Object.entries(AREA_MAPPING);
    for (const [num, name] of mappingEntries) {
      if (name.toLowerCase() === lowerName) {
        return parseInt(num);
      }
    }
    
    // Partial matching for common variations
    const partialMatches = {
      'current': 1,
      'affairs': 1,
      'history': 2,
      'polity': 3,
      'economy': 4,
      'economic': 4,
      'geography': 5,
      'geo': 5,
      'ecology': 6,
      'environment': 6,
      'science': 7,
      'general': 7,
      'arts': 8,
      'culture': 8,
      'art': 8
    };
    
    for (const [key, value] of Object.entries(partialMatches)) {
      if (lowerName.includes(key)) {
        return value;
      }
    }
  }
  
  return 1; // Default to Current Affairs
};

const validateTestData = (jsonData) => {
  const errors = [];
  const warnings = [];
  const fixes = [];

  if (!jsonData || typeof jsonData !== 'object') {
    errors.push('Invalid JSON structure: Expected an object');
    return { errors, warnings, fixes };
  }

  console.log('🔍 Validating JSON data structure (FLEXIBLE MODE with AREA support):', {
    hasYear: !!jsonData.year,
    hasPaper: !!jsonData.paper,
    hasQuestions: !!jsonData.questions,
    questionsLength: jsonData.questions?.length,
    hasTimeInMins: !!jsonData.timeInMins,
    hasCutoff: !!jsonData.cutoff,
    hasNumberOfQuestions: !!jsonData.numberOfQuestions
  });

  // Flexible year validation with auto-fix
  if (!jsonData.year) {
    jsonData.year = new Date().getFullYear();
    fixes.push(`Year not provided, auto-set to current year: ${jsonData.year}`);
  } else if (typeof jsonData.year !== 'number') {
    const yearNum = parseInt(jsonData.year);
    if (!isNaN(yearNum)) {
      jsonData.year = yearNum;
      fixes.push(`Year converted from string to number: ${jsonData.year}`);
    } else {
      jsonData.year = new Date().getFullYear();
      warnings.push(`Invalid year format, auto-set to current year: ${jsonData.year}`);
    }
  } else if (jsonData.year < 2000 || jsonData.year > 2035) {
    warnings.push(`Year ${jsonData.year} is outside typical range (2000-2035), but keeping it`);
  }

  // Flexible paper validation with auto-fix
  if (!jsonData.paper || typeof jsonData.paper !== 'string' || jsonData.paper.trim().length === 0) {
    jsonData.paper = 'General Test';
    fixes.push('Paper name not provided, auto-set to "General Test"');
  } else if (jsonData.paper.trim().length > 100) {
    jsonData.paper = jsonData.paper.trim().substring(0, 100);
    warnings.push('Paper name truncated to 100 characters');
  } else {
    jsonData.paper = jsonData.paper.trim();
  }

  // Flexible questions validation
  if (!jsonData.questions || !Array.isArray(jsonData.questions)) {
    jsonData.questions = [{
      question: 'Sample Question (Please update this)',
      OptionA: 'Option A',
      OptionB: 'Option B', 
      OptionC: 'Option C',
      OptionD: 'Option D',
      key: 'A',
      difficulty: 'Medium',
      area: 1, // Default to Current Affairs
      subarea: '',
      explanation: 'Please add explanation'
    }];
    warnings.push('No questions provided, created a sample question template with area and subarea');
  } else if (jsonData.questions.length === 0) {
    jsonData.questions = [{
      question: 'Sample Question (Please update this)',
      OptionA: 'Option A',
      OptionB: 'Option B', 
      OptionC: 'Option C',
      OptionD: 'Option D',
      key: 'A',
      difficulty: 'Medium',
      area: 1, // Default to Current Affairs
      subarea: '',
      explanation: 'Please add explanation'
    }];
    warnings.push('Empty questions array, created a sample question template with area and subarea');
  } else if (jsonData.questions.length > 500) {
    jsonData.questions = jsonData.questions.slice(0, 500);
    warnings.push('Questions array truncated to 500 questions');
  }

  // Auto-fix numberOfQuestions
  const actualQuestionCount = jsonData.questions.length;
  if (!jsonData.numberOfQuestions || typeof jsonData.numberOfQuestions !== 'number') {
    jsonData.numberOfQuestions = actualQuestionCount;
    fixes.push(`Number of questions auto-calculated as ${jsonData.numberOfQuestions}`);
  } else if (jsonData.numberOfQuestions !== actualQuestionCount) {
    warnings.push(`Number of questions field (${jsonData.numberOfQuestions}) doesn't match questions array length (${actualQuestionCount}). Using array length.`);
    jsonData.numberOfQuestions = actualQuestionCount;
  }

  // Auto-fix timeInMins with flexible calculation
  if (!jsonData.timeInMins || typeof jsonData.timeInMins !== 'number') {
    const calculatedTime = Math.max(30, Math.ceil(jsonData.questions.length * 1.5));
    jsonData.timeInMins = Math.min(calculatedTime, 180);
    fixes.push(`Time not provided, auto-calculated as ${jsonData.timeInMins} minutes`);
  } else if (jsonData.timeInMins < 1 || jsonData.timeInMins > 600) {
    const boundedTime = Math.max(1, Math.min(600, jsonData.timeInMins));
    jsonData.timeInMins = boundedTime;
    warnings.push(`Time duration adjusted to valid range: ${jsonData.timeInMins} minutes`);
  }

  // Flexible cutoff validation with auto-generation
  const requiredCategories = ['Gen', 'EWS', 'OBC', 'SC', 'ST'];
  if (!jsonData.cutoff || typeof jsonData.cutoff !== 'object') {
    jsonData.cutoff = {};
  }
  
  for (const category of requiredCategories) {
    if (!(category in jsonData.cutoff) || typeof jsonData.cutoff[category] !== 'number' || jsonData.cutoff[category] < 0) {
      const percentages = { Gen: 0.30, EWS: 0.30, OBC: 0.25, SC: 0.20, ST: 0.20 };
      const defaultCutoff = Math.round(jsonData.questions.length * percentages[category]);
      jsonData.cutoff[category] = defaultCutoff;
      fixes.push(`Cutoff for ${category} auto-calculated as ${defaultCutoff}`);
    }
  }

  console.log('📊 After flexible validation/auto-fix:', {
    numberOfQuestions: jsonData.numberOfQuestions,
    timeInMins: jsonData.timeInMins,
    cutoff: jsonData.cutoff,
    fixesApplied: fixes.length,
    warningsCount: warnings.length
  });

  // Enhanced question validation with area and subarea support
  jsonData.questions.forEach((question, index) => {
    const questionPrefix = `Question ${index + 1}`;

    // Question text with flexible handling
    if (!question.question || typeof question.question !== 'string' || question.question.trim().length === 0) {
      question.question = `Question ${index + 1} (Please update this)`;
      fixes.push(`${questionPrefix}: Empty question text, set placeholder`);
    } else if (question.question.length > 2000) {
      question.question = question.question.substring(0, 2000);
      warnings.push(`${questionPrefix}: Question text truncated to 2000 characters`);
    }

    // Flexible difficulty with default
    if (!question.difficulty || !['Easy', 'Medium', 'Hard'].includes(question.difficulty)) {
      question.difficulty = 'Medium';
      if (!question.difficulty) {
        fixes.push(`${questionPrefix}: Difficulty set to default: Medium`);
      } else {
        warnings.push(`${questionPrefix}: Invalid difficulty "${question.difficulty}", set to Medium`);
      }
    }

    // Enhanced area validation with auto-conversion
    if (!question.area && !question.Area) {
      question.area = 1; // Default to Current Affairs
      fixes.push(`${questionPrefix}: Area not provided, set to 1 (Current Affairs)`);
    } else {
      // Check both 'area' and 'Area' fields for flexibility
      const areaValue = question.area || question.Area;
      const areaNumber = getAreaNumberFromName(areaValue);
      
      if (question.area !== areaNumber) {
        const oldValue = question.area || question.Area;
        question.area = areaNumber;
        fixes.push(`${questionPrefix}: Area converted from "${oldValue}" to ${areaNumber} (${AREA_MAPPING[areaNumber]})`);
      }
      
      // Remove old Area field if it exists
      if (question.Area) {
        delete question.Area;
      }
    }

    // Flexible subarea handling
    if (!question.subarea && !question.subArea && !question.SubArea) {
      question.subarea = '';
      fixes.push(`${questionPrefix}: Subarea set to empty string`);
    } else {
      // Normalize subarea field name
      const subareaValue = question.subarea || question.subArea || question.SubArea || '';
      question.subarea = typeof subareaValue === 'string' ? subareaValue.trim() : '';
      
      // Remove old field variants
      delete question.subArea;
      delete question.SubArea;
      
      if (question.subarea.length > 100) {
        question.subarea = question.subarea.substring(0, 100);
        warnings.push(`${questionPrefix}: Subarea truncated to 100 characters`);
      }
    }

    // Flexible options validation with auto-creation
    const requiredOptions = ['OptionA', 'OptionB', 'OptionC', 'OptionD'];
    const missingOptions = [];
    
    for (const optionKey of requiredOptions) {
      if (!question[optionKey] || typeof question[optionKey] !== 'string' || question[optionKey].trim().length === 0) {
        const optionLetter = optionKey.replace('Option', '');
        question[optionKey] = `Option ${optionLetter}`;
        missingOptions.push(optionKey);
      } else if (question[optionKey].length > 1000) {
        question[optionKey] = question[optionKey].substring(0, 1000);
        warnings.push(`${questionPrefix}: ${optionKey} text truncated to 1000 characters`);
      }
    }

    if (missingOptions.length > 0) {
      fixes.push(`${questionPrefix}: Auto-generated missing options: ${missingOptions.join(', ')}`);
    }

    // Flexible key validation with auto-fix
    if (!question.key || typeof question.key !== 'string' || !['A', 'B', 'C', 'D'].includes(question.key)) {
      question.key = 'A'; // Default to option A
      if (!question.key) {
        fixes.push(`${questionPrefix}: Key (correct answer) set to default: A`);
      } else {
        warnings.push(`${questionPrefix}: Invalid key "${question.key}", set to A`);
      }
    }

    // Flexible explanation handling
    if (!question.explanation || typeof question.explanation !== 'string') {
      question.explanation = '';
    } else if (question.explanation.length > 2000) {
      question.explanation = question.explanation.substring(0, 2000);
      warnings.push(`${questionPrefix}: Explanation truncated to 2000 characters`);
    }

    // Auto-generate QID if missing
    if (!question.qid || typeof question.qid !== 'string') {
      const year = jsonData.year || new Date().getFullYear();
      const paper = (jsonData.paper || 'Test').replace(/\s+/g, '');
      question.qid = `${year}_${paper}_Q${index + 1}`;
      fixes.push(`${questionPrefix}: QID auto-generated: ${question.qid}`);
    }
  });

  console.log('✅ Flexible validation with area support complete:', {
    errorsCount: errors.length,
    warningsCount: warnings.length,
    fixesCount: fixes.length,
    errors: errors,
    warnings: warnings,
    fixes: fixes
  });

  return { errors, warnings, fixes };
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

// Enhanced function to convert new format to old format with area support
const convertToLegacyFormat = (newFormatData) => {
  try {
    console.log('🔄 Converting to legacy format (FLEXIBLE MODE with AREA support)...');
    
    const safeData = {
      year: newFormatData.year || new Date().getFullYear(),
      paper: (newFormatData.paper || 'General Test').trim(),
      numberOfQuestions: newFormatData.numberOfQuestions || newFormatData.questions?.length || 1,
      timeInMins: newFormatData.timeInMins || 30,
      cutoff: newFormatData.cutoff || {
        Gen: Math.round((newFormatData.questions?.length || 50) * 0.30),
        EWS: Math.round((newFormatData.questions?.length || 50) * 0.30),
        OBC: Math.round((newFormatData.questions?.length || 50) * 0.25),
        SC: Math.round((newFormatData.questions?.length || 50) * 0.20),
        ST: Math.round((newFormatData.questions?.length || 50) * 0.20)
      },
      questions: newFormatData.questions || []
    };

    const legacyFormat = {
      year: safeData.year,
      paper: safeData.paper,
      numberOfQuestions: safeData.numberOfQuestions,
      timeInMins: safeData.timeInMins,
      cutoff: safeData.cutoff,
      questions: safeData.questions.map((q, index) => {
        // Convert area to number if it's a string
        const areaNumber = getAreaNumberFromName(q.area || q.Area || 1);
        
        const safeQuestion = {
          qid: q.qid || `${safeData.year}_${safeData.paper.replace(/\s+/g, '')}_Q${index + 1}`,
          question: (q.question || `Question ${index + 1}`).trim(),
          options: [
            { 
              key: 'A', 
              text: (q.OptionA || 'Option A').trim(), 
              correct: (q.key || 'A') === 'A' 
            },
            { 
              key: 'B', 
              text: (q.OptionB || 'Option B').trim(), 
              correct: (q.key || 'A') === 'B' 
            },
            { 
              key: 'C', 
              text: (q.OptionC || 'Option C').trim(), 
              correct: (q.key || 'A') === 'C' 
            },
            { 
              key: 'D', 
              text: (q.OptionD || 'Option D').trim(), 
              correct: (q.key || 'A') === 'D' 
            }
          ],
          explanation: q.explanation || '',
          difficulty: q.difficulty || 'Medium',
          area: areaNumber, // Store as number
          subarea: q.subarea || q.subArea || q.SubArea || '' // Normalize subarea field
        };

        return safeQuestion;
      })
    };

    console.log('✅ Flexible legacy format conversion with area support complete:', {
      questionsConverted: legacyFormat.questions.length,
      year: legacyFormat.year,
      paper: legacyFormat.paper,
      timeInMins: legacyFormat.timeInMins,
      areasProcessed: legacyFormat.questions.map(q => `${q.area}:${AREA_MAPPING[q.area]}`).slice(0, 3) // Sample areas
    });

    return legacyFormat;
  } catch (error) {
    console.error('❌ Error in flexible conversion with area support:', error);
    
    return {
      year: new Date().getFullYear(),
      paper: 'Default Test',
      numberOfQuestions: 1,
      timeInMins: 30,
      cutoff: { Gen: 15, EWS: 15, OBC: 13, SC: 10, ST: 10 },
      questions: [{
        qid: `${new Date().getFullYear()}_DefaultTest_Q1`,
        question: 'Sample question (please update)',
        options: [
          { key: 'A', text: 'Option A', correct: true },
          { key: 'B', text: 'Option B', correct: false },
          { key: 'C', text: 'Option C', correct: false },
          { key: 'D', text: 'Option D', correct: false }
        ],
        explanation: 'Please add explanation',
        difficulty: 'Medium',
        area: 1, // Default to Current Affairs
        subarea: ''
      }]
    };
  }
};

// Enhanced function to analyze and provide detailed JSON error information
const analyzeJsonError = (jsonString, parseError) => {
  const lines = jsonString.split('\n');
  const errorInfo = {
    message: parseError.message,
    suggestions: [],
    severity: 'warning'
  };

  const lineMatch = parseError.message.match(/line (\d+)/i) || parseError.message.match(/position (\d+)/i);
  
  if (lineMatch) {
    const position = parseInt(lineMatch[1]);
    errorInfo.line = Math.min(position, lines.length);
    errorInfo.context = lines.slice(Math.max(0, position - 3), Math.min(lines.length, position + 2));
  }

  errorInfo.suggestions = [
    'Try uploading even with minor JSON errors - the system can auto-fix many issues',
    'For area field: use numbers 1-8 or names like "Current Affairs", "History", etc.',
    'Subarea field can be any text describing the specific topic',
    'Check for missing commas between objects and arrays',
    'Ensure all strings are properly quoted with double quotes',
    'Verify that all brackets [ ] and braces { } are properly closed'
  ];

  if (parseError.message.includes('Unexpected token')) {
    errorInfo.suggestions.unshift('Check for missing or extra commas, quotation marks, or brackets');
  }
  
  if (parseError.message.includes('Unexpected end')) {
    errorInfo.suggestions.unshift('The JSON appears to be incomplete - check for missing closing brackets');
  }

  return errorInfo;
};

// Function to create a minimal valid JSON with area and subarea
const createMinimalValidJson = () => {
  return {
    year: new Date().getFullYear(),
    paper: 'Default Test',
    timeInMins: 30,
    questions: [{
      question: 'Sample Question (Please update this)',
      OptionA: 'Option A',
      OptionB: 'Option B',
      OptionC: 'Option C', 
      OptionD: 'Option D',
      key: 'A',
      difficulty: 'Medium',
      area: 1, // Current Affairs
      subarea: 'General Topics',
      explanation: 'Please add explanation'
    }]
  };
};

// Helper function to get area options for frontend
const getAreaOptions = () => {
  return Object.entries(AREA_MAPPING).map(([value, label]) => ({
    value: parseInt(value),
    label: label
  }));
};

module.exports = {
  validateTestData,
  validateEmail,
  validateTestName,
  validateDuration,
  convertToLegacyFormat,
  analyzeJsonError,
  createMinimalValidJson,
  AREA_MAPPING,
  getAreaNumberFromName,
  getAreaOptions
};
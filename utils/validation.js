// Validation utility functions

const validateTestData = (jsonData) => {
  const errors = [];

  // Check if jsonData exists and is an object
  if (!jsonData || typeof jsonData !== 'object') {
    errors.push('Invalid JSON structure');
    return errors;
  }

  // Validate required top-level fields
  if (!jsonData.year || typeof jsonData.year !== 'number') {
    errors.push('Year is required and must be a number');
  } else if (jsonData.year < 2000 || jsonData.year > 2030) {
    errors.push('Year must be between 2000 and 2030');
  }

  if (!jsonData.paper || typeof jsonData.paper !== 'string') {
    errors.push('Paper is required and must be a string');
  }

  // Validate number of questions
  if (!jsonData.numberOfQuestions || typeof jsonData.numberOfQuestions !== 'number') {
    errors.push('Number of questions is required and must be a number');
  } else if (jsonData.numberOfQuestions < 1 || jsonData.numberOfQuestions > 300) {
    errors.push('Number of questions must be between 1 and 300');
  }

  // Validate time in minutes
  if (!jsonData.timeInMins || typeof jsonData.timeInMins !== 'number') {
    errors.push('Time in minutes is required and must be a number');
  } else if (jsonData.timeInMins < 1 || jsonData.timeInMins > 600) {
    errors.push('Time must be between 1 and 600 minutes');
  }

  // Validate cutoff object
  if (!jsonData.cutoff || typeof jsonData.cutoff !== 'object') {
    errors.push('Cutoff is required and must be an object');
  } else {
    const requiredCategories = ['Gen', 'EWS', 'OBC', 'SC', 'ST'];
    for (const category of requiredCategories) {
      if (!(category in jsonData.cutoff)) {
        errors.push(`Cutoff for ${category} category is required`);
      } else if (typeof jsonData.cutoff[category] !== 'number') {
        errors.push(`Cutoff for ${category} must be a number`);
      } else if (jsonData.cutoff[category] < 0) {
        errors.push(`Cutoff for ${category} cannot be negative`);
      }
    }
  }

  if (!jsonData.questions || !Array.isArray(jsonData.questions)) {
    errors.push('Questions array is required');
    return errors; // Stop validation if questions array is missing
  }

  if (jsonData.questions.length === 0) {
    errors.push('At least one question is required');
    return errors;
  }

  if (jsonData.questions.length > 300) {
    errors.push('Maximum 300 questions allowed');
  }

  // Validate that number of questions matches array length
  if (jsonData.numberOfQuestions && jsonData.questions.length !== jsonData.numberOfQuestions) {
    errors.push(`Number of questions (${jsonData.numberOfQuestions}) does not match actual questions array length (${jsonData.questions.length})`);
  }

  // Validate each question
  jsonData.questions.forEach((question, index) => {
    const questionPrefix = `Question ${index + 1}`;

    if (!question.question || typeof question.question !== 'string') {
      errors.push(`${questionPrefix}: Question text is required`);
    } else if (question.question.length > 1000) {
      errors.push(`${questionPrefix}: Question text cannot exceed 1000 characters`);
    }

    // Validate difficulty
    if (!question.difficulty || typeof question.difficulty !== 'string') {
      errors.push(`${questionPrefix}: Difficulty is required`);
    } else {
      const validDifficulties = ['Easy', 'Medium', 'Hard'];
      if (!validDifficulties.includes(question.difficulty)) {
        errors.push(`${questionPrefix}: Difficulty must be one of: ${validDifficulties.join(', ')}`);
      }
    }

    // Validate area
    if (!question.area || typeof question.area !== 'string') {
      errors.push(`${questionPrefix}: Area is required`);
    } else if (question.area.length > 100) {
      errors.push(`${questionPrefix}: Area cannot exceed 100 characters`);
    }

    // Validate options (A, B, C, D)
    const requiredOptions = ['OptionA', 'OptionB', 'OptionC', 'OptionD'];
    for (const optionKey of requiredOptions) {
      if (!question[optionKey] || typeof question[optionKey] !== 'string') {
        errors.push(`${questionPrefix}: ${optionKey} is required and must be a string`);
      } else if (question[optionKey].length > 500) {
        errors.push(`${questionPrefix}: ${optionKey} text cannot exceed 500 characters`);
      }
    }

    // Validate key (correct answer)
    if (!question.key || typeof question.key !== 'string') {
      errors.push(`${questionPrefix}: Key (correct answer) is required`);
    } else {
      const validKeys = ['A', 'B', 'C', 'D'];
      if (!validKeys.includes(question.key)) {
        errors.push(`${questionPrefix}: Key must be one of: A, B, C, D`);
      }
    }

    // Validate explanation if provided
    if (question.explanation && typeof question.explanation !== 'string') {
      errors.push(`${questionPrefix}: Explanation must be a string`);
    } else if (question.explanation && question.explanation.length > 1000) {
      errors.push(`${questionPrefix}: Explanation cannot exceed 1000 characters`);
    }
  });

  return errors;
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validateTestName = (name) => {
  if (!name || typeof name !== 'string') {
    return false;
  }
  return name.trim().length >= 3 && name.trim().length <= 200;
};

const validateDuration = (duration) => {
  const num = parseInt(duration);
  return !isNaN(num) && num >= 1 && num <= 600;
};

// Helper function to convert new format to old format for backward compatibility
const convertToLegacyFormat = (newFormatData) => {
  const legacyFormat = {
    year: newFormatData.year,
    paper: newFormatData.paper,
    questions: newFormatData.questions.map((q, index) => ({
      qid: `${newFormatData.year}_${newFormatData.paper.replace(/\s+/g, '')}_Q${index + 1}`,
      question: q.question,
      options: [
        { key: 'A', text: q.OptionA, correct: q.key === 'A' },
        { key: 'B', text: q.OptionB, correct: q.key === 'B' },
        { key: 'C', text: q.OptionC, correct: q.key === 'C' },
        { key: 'D', text: q.OptionD, correct: q.key === 'D' }
      ],
      explanation: q.explanation || '',
      difficulty: q.difficulty,
      area: q.area
    })),
    // Store additional metadata
    numberOfQuestions: newFormatData.numberOfQuestions,
    timeInMins: newFormatData.timeInMins,
    cutoff: newFormatData.cutoff
  };

  return legacyFormat;
};

module.exports = {
  validateTestData,
  validateEmail,
  validateTestName,
  validateDuration,
  convertToLegacyFormat
};
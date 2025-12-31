const mongoose = require('mongoose');
const User = require('../models/User');
const UserTestRecord = require('../models/UserTestRecord');
const Test = require('../models/Test');

/**
 * Data Migration Utility for upgrading to new User/UserTestRecord schema
 * This utility helps migrate existing data to the new architecture while preserving all existing functionality
 */

class DataMigrationUtility {
  constructor() {
    this.migrationLog = [];
    this.errors = [];
    this.stats = {
      usersCreated: 0,
      usersUpdated: 0,
      recordsUpdated: 0,
      recordsProcessed: 0,
      errorsCount: 0
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, type, message };
    this.migrationLog.push(logEntry);
    console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
  }

  async migrateExistingData(options = {}) {
    const {
      batchSize = 100,
      dryRun = false,
      continueOnError = true
    } = options;

    this.log('Starting data migration to new User/UserTestRecord schema');
    this.log(`Options: batchSize=${batchSize}, dryRun=${dryRun}, continueOnError=${continueOnError}`);

    try {
      // Step 1: Create User records from existing UserTestRecord emails
      await this.createUsersFromTestRecords(batchSize, dryRun, continueOnError);

      // Step 2: Update UserTestRecord documents with userId references
      await this.updateTestRecordsWithUserIds(batchSize, dryRun, continueOnError);

      // Step 3: Enhance existing UserTestRecord with new fields
      await this.enhanceTestRecords(batchSize, dryRun, continueOnError);

      // Step 4: Update Test documents to ensure compatibility
      await this.updateTestDocuments(batchSize, dryRun, continueOnError);

      this.log('Migration completed successfully');
      this.printMigrationSummary();

      return {
        success: true,
        stats: this.stats,
        log: this.migrationLog,
        errors: this.errors
      };

    } catch (error) {
      this.log(`Migration failed: ${error.message}`, 'error');
      this.errors.push({ step: 'general', error: error.message });
      
      return {
        success: false,
        stats: this.stats,
        log: this.migrationLog,
        errors: this.errors
      };
    }
  }

  async createUsersFromTestRecords(batchSize, dryRun, continueOnError) {
    this.log('Step 1: Creating User records from existing test records');

    try {
      // Get unique email/phone combinations from existing test records
      const uniqueUsers = await UserTestRecord.aggregate([
        {
          $group: {
            _id: {
              email: '$email',
              phoneNumber: { $ifNull: ['$phoneNumber', ''] }
            },
            firstSeen: { $min: '$completedAt' },
            lastSeen: { $max: '$completedAt' },
            testCount: { $sum: 1 }
          }
        },
        {
          $match: {
            '_id.email': { $ne: null, $ne: '' }
          }
        }
      ]);

      this.log(`Found ${uniqueUsers.length} unique users to create`);

      for (let i = 0; i < uniqueUsers.length; i += batchSize) {
        const batch = uniqueUsers.slice(i, i + batchSize);
        
        for (const userInfo of batch) {
          try {
            const { email, phoneNumber } = userInfo._id;
            
            // Check if user already exists
            const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
            
            if (existingUser) {
              this.log(`User already exists: ${email}`);
              this.stats.usersUpdated++;
              continue;
            }

            // Create new user
            if (!dryRun) {
              const newUser = new User({
                email: email.toLowerCase().trim(),
                phoneNumber: phoneNumber || '+919999999999', // Default phone if not available
                profile: {
                  firstName: '',
                  lastName: '',
                  category: 'General'
                },
                statistics: {
                  totalTestsAttempted: userInfo.testCount,
                  totalTestsCompleted: userInfo.testCount,
                  lastTestDate: userInfo.lastSeen
                },
                security: {
                  lastLoginAt: userInfo.lastSeen,
                  loginCount: 1,
                  isActive: true,
                  isVerified: true
                },
                createdAt: userInfo.firstSeen,
                updatedAt: userInfo.lastSeen
              });

              await newUser.save();
              this.log(`Created user: ${email} with ${userInfo.testCount} tests`);
              this.stats.usersCreated++;
            } else {
              this.log(`[DRY RUN] Would create user: ${email}`);
              this.stats.usersCreated++;
            }

          } catch (error) {
            this.log(`Error creating user ${userInfo._id.email}: ${error.message}`, 'error');
            this.errors.push({ 
              step: 'createUser', 
              email: userInfo._id.email, 
              error: error.message 
            });
            this.stats.errorsCount++;

            if (!continueOnError) {
              throw error;
            }
          }
        }

        this.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueUsers.length / batchSize)}`);
      }

    } catch (error) {
      this.log(`Error in createUsersFromTestRecords: ${error.message}`, 'error');
      throw error;
    }
  }

  async updateTestRecordsWithUserIds(batchSize, dryRun, continueOnError) {
    this.log('Step 2: Updating UserTestRecord documents with userId references');

    try {
      // Get all test records that don't have userId
      const totalRecords = await UserTestRecord.countDocuments({ userId: { $exists: false } });
      this.log(`Found ${totalRecords} test records to update`);

      let processed = 0;

      while (processed < totalRecords) {
        const records = await UserTestRecord.find({ userId: { $exists: false } })
          .limit(batchSize)
          .select('_id email');

        if (records.length === 0) break;

        for (const record of records) {
          try {
            // Find corresponding user
            const user = await User.findOne({ 
              email: record.email.toLowerCase().trim() 
            }).select('_id');

            if (user) {
              if (!dryRun) {
                await UserTestRecord.findByIdAndUpdate(record._id, {
                  $set: { userId: user._id }
                });
              }
              
              this.log(`Updated record ${record._id} with userId ${user._id}`);
              this.stats.recordsUpdated++;
            } else {
              this.log(`No user found for email: ${record.email}`, 'warning');
            }

          } catch (error) {
            this.log(`Error updating record ${record._id}: ${error.message}`, 'error');
            this.errors.push({ 
              step: 'updateRecord', 
              recordId: record._id, 
              error: error.message 
            });
            this.stats.errorsCount++;

            if (!continueOnError) {
              throw error;
            }
          }
        }

        processed += records.length;
        this.stats.recordsProcessed += records.length;
        this.log(`Progress: ${processed}/${totalRecords} records processed`);
      }

    } catch (error) {
      this.log(`Error in updateTestRecordsWithUserIds: ${error.message}`, 'error');
      throw error;
    }
  }

  async enhanceTestRecords(batchSize, dryRun, continueOnError) {
    this.log('Step 3: Enhancing UserTestRecord documents with new fields');

    try {
      const totalRecords = await UserTestRecord.countDocuments({});
      this.log(`Processing ${totalRecords} records for enhancement`);

      let processed = 0;

      while (processed < totalRecords) {
        const records = await UserTestRecord.find({})
          .limit(batchSize)
          .populate('testId');

        if (records.length === 0) break;

        for (const record of records) {
          try {
            const updateData = {};

            // Add completion details if missing
            if (!record.completion) {
              updateData.completion = {
                startedAt: record.createdAt || new Date(),
                completedAt: record.completedAt || record.updatedAt || new Date(),
                submissionType: record.timeExpired ? 'timeout' : 'manual',
                deviceInfo: {},
                interruptions: 0
              };
            }

            // Add timeAllotted if missing
            if (!record.timeAllotted && record.testId) {
              updateData.timeAllotted = record.testId.duration || record.timeTaken || 60;
            }

            // Enhance answers with detailed information if needed
            if (record.answers && record.testId && record.testId.questions) {
              const enhancedAnswers = new Map();
              
              for (const [questionIndex, selectedOption] of record.answers.entries()) {
                const question = record.testId.questions[parseInt(questionIndex)];
                const correctOption = question?.options?.find(opt => opt.correct);
                
                enhancedAnswers.set(questionIndex, {
                  selectedOption: selectedOption || '',
                  correctOption: correctOption?.key || 'A',
                  isCorrect: selectedOption === correctOption?.key,
                  timeSpent: 0,
                  attempts: 1,
                  difficulty: question?.difficulty || 'Medium',
                  area: question?.area || 1,
                  subarea: question?.subarea || '',
                  questionText: question?.question || '',
                  explanation: question?.explanation || ''
                });
              }
              
              updateData.answers = enhancedAnswers;
            }

            // Add metadata if missing
            if (!record.metadata) {
              updateData.metadata = {
                version: '2.0',
                source: 'web',
                isPublic: false
              };
            }

            // Update record if there are changes
            if (Object.keys(updateData).length > 0) {
              if (!dryRun) {
                await UserTestRecord.findByIdAndUpdate(record._id, {
                  $set: updateData
                });
              }
              
              this.log(`Enhanced record ${record._id}`);
            }

          } catch (error) {
            this.log(`Error enhancing record ${record._id}: ${error.message}`, 'error');
            this.errors.push({ 
              step: 'enhanceRecord', 
              recordId: record._id, 
              error: error.message 
            });
            this.stats.errorsCount++;

            if (!continueOnError) {
              throw error;
            }
          }
        }

        processed += records.length;
        this.log(`Enhanced: ${processed}/${totalRecords} records`);
      }

    } catch (error) {
      this.log(`Error in enhanceTestRecords: ${error.message}`, 'error');
      throw error;
    }
  }

  async updateTestDocuments(batchSize, dryRun, continueOnError) {
    this.log('Step 4: Updating Test documents for compatibility');

    try {
      const totalTests = await Test.countDocuments({});
      this.log(`Processing ${totalTests} test documents`);

      let processed = 0;

      while (processed < totalTests) {
        const tests = await Test.find({}).limit(batchSize);

        if (tests.length === 0) break;

        for (const test of tests) {
          try {
            const updateData = {};

            // Ensure isActive field exists
            if (test.isActive === undefined) {
              updateData.isActive = true;
            }

            // Validate and fix scoring
            if (!test.scoring || typeof test.scoring !== 'object') {
              updateData.scoring = {
                correct: 4,
                wrong: -1,
                unanswered: 0
              };
            }

            // Ensure area field is numeric for all questions
            if (test.questions && test.questions.length > 0) {
              const updatedQuestions = test.questions.map(question => {
                if (!question.area || isNaN(question.area)) {
                  question.area = 1;
                }
                if (!question.subarea) {
                  question.subarea = '';
                }
                return question;
              });
              
              updateData.questions = updatedQuestions;
            }

            // Update if there are changes
            if (Object.keys(updateData).length > 0) {
              if (!dryRun) {
                await Test.findByIdAndUpdate(test._id, {
                  $set: updateData
                });
              }
              
              this.log(`Updated test ${test._id}: ${test.name}`);
            }

          } catch (error) {
            this.log(`Error updating test ${test._id}: ${error.message}`, 'error');
            this.errors.push({ 
              step: 'updateTest', 
              testId: test._id, 
              error: error.message 
            });
            this.stats.errorsCount++;

            if (!continueOnError) {
              throw error;
            }
          }
        }

        processed += tests.length;
        this.log(`Updated: ${processed}/${totalTests} tests`);
      }

    } catch (error) {
      this.log(`Error in updateTestDocuments: ${error.message}`, 'error');
      throw error;
    }
  }

  printMigrationSummary() {
    this.log('\n=== MIGRATION SUMMARY ===');
    this.log(`Users Created: ${this.stats.usersCreated}`);
    this.log(`Users Updated: ${this.stats.usersUpdated}`);
    this.log(`Records Updated: ${this.stats.recordsUpdated}`);
    this.log(`Records Processed: ${this.stats.recordsProcessed}`);
    this.log(`Errors Encountered: ${this.stats.errorsCount}`);
    this.log('=========================\n');

    if (this.errors.length > 0) {
      this.log('\nERRORS SUMMARY:');
      this.errors.forEach((error, index) => {
        this.log(`${index + 1}. [${error.step}] ${error.error}`);
      });
    }
  }

  // Utility method to verify migration
  async verifyMigration() {
    this.log('Verifying migration...');

    const verification = {
      totalUsers: await User.countDocuments({}),
      totalTestRecords: await UserTestRecord.countDocuments({}),
      recordsWithUserId: await UserTestRecord.countDocuments({ userId: { $exists: true } }),
      recordsWithoutUserId: await UserTestRecord.countDocuments({ userId: { $exists: false } }),
      usersWithTestHistory: 0,
      orphanedRecords: 0
    };

    // Check for orphaned records
    verification.orphanedRecords = await UserTestRecord.countDocuments({
      userId: { $exists: true },
      $expr: {
        $eq: [
          { $size: { 
            $ifNull: [
              { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
              []
            ] 
          }}, 
          0
        ]
      }
    });

    // Check users with test history
    const usersWithTests = await User.aggregate([
      {
        $lookup: {
          from: 'usertestrecords',
          localField: '_id',
          foreignField: 'userId',
          as: 'tests'
        }
      },
      {
        $match: { 'tests.0': { $exists: true } }
      },
      { $count: 'count' }
    ]);

    verification.usersWithTestHistory = usersWithTests[0]?.count || 0;

    this.log('\n=== VERIFICATION RESULTS ===');
    Object.entries(verification).forEach(([key, value]) => {
      this.log(`${key}: ${value}`);
    });
    this.log('=============================\n');

    return verification;
  }
}

// Export migration utility and helper functions
module.exports = {
  DataMigrationUtility,

  // Helper function to run migration
  runMigration: async (options = {}) => {
    const migrator = new DataMigrationUtility();
    return await migrator.migrateExistingData(options);
  },

  // Helper function to verify migration
  verifyMigration: async () => {
    const migrator = new DataMigrationUtility();
    return await migrator.verifyMigration();
  }
};
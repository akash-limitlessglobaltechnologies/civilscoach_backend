const twilio = require('twilio');

// Initialize Twilio client
let twilioClient = null;

const initializeTwilio = () => {
  if (!twilioClient) {
    try {
      twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      console.log('📱 Twilio client initialized successfully');
    } catch (error) {
      console.error('📱 Twilio initialization error:', error.message);
      throw error;
    }
  }
  return twilioClient;
};

// Send OTP via SMS using Twilio Verify Service (PROPER IMPLEMENTATION)
const sendOTPSMS = async (phoneNumber) => {
  try {
    const client = initializeTwilio();

    // Format phone number (ensure it starts with +)
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;

    // Use Twilio Verify Service - it handles international SMS properly
    const verification = await client.verify.v2
      .services(process.env.TWILIO_SERVICE_SID)
      .verifications.create({
        to: formattedPhone,
        channel: 'sms'
      });

    console.log('📱 SMS sent via Twilio Verify Service:', {
      sid: verification.sid,
      to: formattedPhone,
      status: verification.status
    });

    return {
      success: true,
      messageId: verification.sid,
      status: verification.status,
      to: formattedPhone,
      method: 'verify-service'
    };

  } catch (error) {
    console.error('📱 SMS sending error:', {
      error: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo
    });

    // Handle specific Twilio errors
    if (error.code === 21211) {
      throw new Error('Invalid phone number format. Please check the phone number and try again.');
    }
    if (error.code === 21408) {
      throw new Error('Permission denied for sending SMS to this number.');
    }
    if (error.code === 21610) {
      throw new Error('Phone number is not reachable or blocked.');
    }
    if (error.code === 21614) {
      throw new Error('Phone number is invalid or not a mobile number.');
    }

    throw new Error(`Failed to send OTP SMS: ${error.message}`);
  }
};

// Verify SMS OTP using Twilio Verify Service with retry logic
const verifySMSOTP = async (phoneNumber, otpCode) => {
  try {
    if (!process.env.TWILIO_SERVICE_SID) {
      throw new Error('Twilio Verify Service SID not configured');
    }

    const client = initializeTwilio();
    
    // Format phone number
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;

    // Try verification with retry for pending status
    let attempt = 0;
    const maxAttempts = 3;
    
    while (attempt < maxAttempts) {
      try {
        const verificationCheck = await client.verify.v2
          .services(process.env.TWILIO_SERVICE_SID)
          .verificationChecks.create({
            to: formattedPhone,
            code: otpCode
          });

        console.log('📱 SMS OTP verification result:', {
          status: verificationCheck.status,
          to: formattedPhone,
          valid: verificationCheck.valid,
          attempt: attempt + 1
        });

        // Handle different statuses
        if (verificationCheck.status === 'approved') {
          return {
            success: true,
            status: verificationCheck.status,
            to: formattedPhone
          };
        } else if (verificationCheck.status === 'pending' && attempt < maxAttempts - 1) {
          // Wait and retry for pending status
          console.log('📱 SMS verification pending, retrying in 2 seconds...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempt++;
          continue;
        } else {
          return {
            success: false,
            status: verificationCheck.status,
            error: `SMS verification ${verificationCheck.status}. Please check the code and try again.`
          };
        }

      } catch (verifyError) {
        if (verifyError.code === 20404) {
          return {
            success: false,
            error: 'SMS verification session expired. Please request a new OTP.'
          };
        } else if (verifyError.code === 20409) {
          return {
            success: false,
            error: 'SMS verification already completed or expired. Please request a new OTP.'
          };
        } else if (attempt === maxAttempts - 1) {
          throw verifyError;
        } else {
          // Retry on temporary errors
          console.log(`📱 SMS verification attempt ${attempt + 1} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempt++;
        }
      }
    }

  } catch (error) {
    console.error('📱 SMS OTP verification error:', error.message);
    
    return {
      success: false,
      error: error.message || 'SMS verification failed'
    };
  }
};

// Test Twilio connection
const testTwilioConnection = async () => {
  try {
    const client = initializeTwilio();
    
    // Test by fetching account details
    const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    
    console.log('📱 Twilio connection verified:', {
      accountSid: account.sid,
      status: account.status
    });

    return true;
  } catch (error) {
    console.error('📱 Twilio connection test failed:', error.message);
    return false;
  }
};

// Validate phone number format
const validatePhoneNumber = (phoneNumber) => {
  // Remove spaces, dashes, and parentheses
  const cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  // Check for Indian mobile numbers
  const indianMobileRegex = /^(\+91|91)?[6-9]\d{9}$/;
  
  // Check for international format
  const internationalRegex = /^\+[1-9]\d{1,14}$/;
  
  return indianMobileRegex.test(cleanNumber) || internationalRegex.test(cleanNumber);
};

module.exports = {
  sendOTPSMS,
  verifySMSOTP,
  testTwilioConnection,
  validatePhoneNumber,
  initializeTwilio
};
const nodemailer = require('nodemailer');

// Email service configuration for Zoho Workplace (Business Domain)
const createEmailTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtppro.zoho.in', // Business domain SMTP server
    port: 465,
    secure: true, // Use SSL for port 465
    auth: {
      user: process.env.ZOHO_EMAIL, // support@civilscoach.com
      pass: process.env.ZOHO_PASSWORD // App-specific password
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Send OTP email
const sendOTPEmail = async (email, otp, purpose = 'login') => {
  try {
    const transporter = createEmailTransporter();

    const mailOptions = {
      from: {
        name: 'Civils Coach',
        address: process.env.ZOHO_EMAIL
      },
      to: email,
      subject: `Your Civils Coach OTP - ${otp}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Civils Coach OTP</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #3B82F6; }
            .logo { font-size: 24px; font-weight: bold; color: #3B82F6; }
            .content { padding: 30px 0; }
            .otp-box { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 20px;
              border-radius: 10px;
              margin: 20px 0;
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 8px;
            }
            .warning { 
              background: #FEF3C7;
              border: 1px solid #F59E0B;
              color: #92400E;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer { 
              text-align: center;
              padding: 20px 0;
              border-top: 1px solid #E5E7EB;
              color: #6B7280;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">🎓 Civils Coach</div>
              <p style="margin: 10px 0 0 0; color: #6B7280;">Your Gateway to Civil Services Success</p>
            </div>
            
            <div class="content">
              <h2 style="color: #1F2937; margin-bottom: 20px;">Verification Required</h2>
              
              <p>Hello,</p>
              <p>You've requested access to Civils Coach. Please use the following OTP to complete your ${purpose}:</p>
              
              <div class="otp-box">${otp}</div>
              
              <div class="warning">
                <strong>⚠️ Important Security Information:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>This OTP is valid for <strong>10 minutes</strong> only</li>
                  <li>Never share this OTP with anyone</li>
                  <li>Our team will never ask for your OTP</li>
                  <li>If you didn't request this, please ignore this email</li>
                </ul>
              </div>
              
              <p style="color: #6B7280;">
                This OTP will expire in 10 minutes for security reasons. If you need a new OTP, 
                please request it from the login page.
              </p>
              
              <p style="margin-top: 30px;">
                Best regards,<br>
                <strong>Team Civils Coach</strong>
              </p>
            </div>
            
            <div class="footer">
              <p>📧 support@civilscoach.com | 🌐 www.civilscoach.com</p>
              <p style="margin: 5px 0;">This is an automated email. Please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Civils Coach - OTP Verification
        
        Your OTP for ${purpose}: ${otp}
        
        This OTP is valid for 10 minutes only.
        Never share this OTP with anyone.
        
        If you didn't request this, please ignore this email.
        
        Best regards,
        Team Civils Coach
        support@civilscoach.com
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('📧 Email sent successfully:', {
      messageId: result.messageId,
      to: email,
      accepted: result.accepted,
      rejected: result.rejected
    });

    return {
      success: true,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected
    };

  } catch (error) {
    console.error('📧 Email sending error:', {
      error: error.message,
      code: error.code,
      command: error.command
    });

    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
};

// Send welcome email after successful verification
const sendWelcomeEmail = async (email) => {
  try {
    const transporter = createEmailTransporter();

    const mailOptions = {
      from: {
        name: 'Civils Coach',
        address: process.env.ZOHO_EMAIL
      },
      to: email,
      subject: 'Welcome to Civils Coach! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Welcome to Civils Coach</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; }
            .logo { font-size: 28px; font-weight: bold; color: #3B82F6; }
            .welcome-box { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 30px;
              border-radius: 15px;
              margin: 30px 0;
            }
            .features { display: flex; flex-wrap: wrap; gap: 20px; margin: 30px 0; }
            .feature { flex: 1; min-width: 250px; padding: 20px; border: 1px solid #E5E7EB; border-radius: 8px; }
            .cta-button {
              display: inline-block;
              background: #3B82F6;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: bold;
              margin: 20px auto;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">🎓 Civils Coach</div>
            </div>
            
            <div class="welcome-box">
              <h1 style="margin: 0 0 10px 0;">Welcome to Civils Coach!</h1>
              <p style="margin: 0; font-size: 18px;">Your journey to civil services success starts here</p>
            </div>
            
            <div style="text-align: center;">
              <h2>What's Next?</h2>
              <p>You now have access to our comprehensive test platform designed specifically for civil services preparation.</p>
            </div>
            
            <div class="features">
              <div class="feature">
                <h3>📝 Practice Tests</h3>
                <p>Access hundreds of practice questions to sharpen your skills</p>
              </div>
              <div class="feature">
                <h3>📊 Previous Year Questions</h3>
                <p>Solve authentic previous year questions from various examinations</p>
              </div>
              <div class="feature">
                <h3>📈 Performance Analytics</h3>
                <p>Track your progress with detailed performance insights</p>
              </div>
              <div class="feature">
                <h3>⏱️ Timed Assessments</h3>
                <p>Simulate real exam conditions with our timed test environment</p>
              </div>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${process.env.FRONTEND_URL || 'https://civilscoach.com'}" class="cta-button">
                Start Your First Test →
              </a>
            </div>
            
            <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 30px 0;">
              <h3>Need Help?</h3>
              <p>Our support team is here to assist you:</p>
              <p>📧 Email: support@civilscoach.com<br>
              🕒 Response time: Within 24 hours</p>
            </div>
            
            <div style="text-align: center; color: #6B7280; font-size: 14px; margin-top: 40px;">
              <p>Best wishes for your preparation!</p>
              <p><strong>Team Civils Coach</strong></p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('📧 Welcome email sent successfully to:', email);

  } catch (error) {
    console.error('📧 Welcome email error:', error.message);
    // Don't throw error for welcome email failure
  }
};

// Test email configuration
const testEmailConnection = async () => {
  try {
    const transporter = createEmailTransporter();
    await transporter.verify();
    console.log('📧 Email service connection verified successfully');
    return true;
  } catch (error) {
    console.error('📧 Email service connection failed:', error.message);
    return false;
  }
};

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail,
  testEmailConnection
};
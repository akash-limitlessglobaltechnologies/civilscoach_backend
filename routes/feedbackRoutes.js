// routes/feedbackRoutes.js
const express = require('express');
const router = express.Router();

// POST /api/feedback - Submit feedback to Slack
router.post('/', async (req, res) => {
  try {
    const { userName, userEmail, userPhone, feedback, userId, source } = req.body;

    // Validate
    if (!feedback || !feedback.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Feedback is required' 
      });
    }

    const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

    if (!SLACK_WEBHOOK_URL) {
      console.error('SLACK_WEBHOOK_URL not configured in environment');
      return res.status(500).json({ 
        success: false, 
        message: 'Feedback system not configured' 
      });
    }

    // Timestamp
    const timestamp = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Slack message
    const slackMessage = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📢 New Feedback Received',
            emoji: true
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Name:*\n${userName || 'Anonymous'}`
            },
            {
              type: 'mrkdwn',
              text: `*Time:*\n${timestamp}`
            },
            {
              type: 'mrkdwn',
              text: `*Email:*\n${userEmail || 'N/A'}`
            },
            {
              type: 'mrkdwn',
              text: `*Phone:*\n${userPhone || 'N/A'}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Feedback:*\n${feedback}`
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Source: ${source || 'Unknown'} | User ID: ${userId || 'N/A'}`
            }
          ]
        }
      ]
    };

    // Send to Slack
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    if (!response.ok) {
      throw new Error('Failed to send to Slack');
    }

    res.json({ 
      success: true, 
      message: 'Feedback submitted successfully' 
    });

  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit feedback' 
    });
  }
});

module.exports = router;
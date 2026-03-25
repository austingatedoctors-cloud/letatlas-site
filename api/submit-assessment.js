export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const data = req.body;

  // Always log the full submission to Vercel function logs (never lose data)
  console.log('=== NEW ASSESSMENT SUBMISSION ===');
  console.log(JSON.stringify(data, null, 2));
  console.log('=== END SUBMISSION ===');

  // Extract contact info
  const companyName = data.companyName || 'Unknown Company';
  const contactName = data.contactName || 'Not provided';
  const contactEmail = data.contactEmail || 'Not provided';
  const contactPhone = data.contactPhone || '';
  const businessType = data.businessType || 'Not specified';

  // Build HTML email
  const emailHtml = buildEmailHtml(data);

  // Try sending via Resend API
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'LetAtlas Assessments <assessments@letatlas.ai>',
          to: 'evan@letatlas.ai',
          reply_to: contactEmail !== 'Not provided' ? contactEmail : undefined,
          subject: `🎯 New Lead: ${companyName} (${businessType}) — AI Readiness Assessment`,
          html: emailHtml,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Resend API error:', response.status, errorBody);
      } else {
        console.log('Email sent successfully via Resend');
      }
    } catch (error) {
      console.error('Email send error:', error.message);
    }
  } else {
    console.warn('RESEND_API_KEY not configured — submission logged but no email sent');
  }

  // Slack webhook backup notification (best-effort)
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      const painPoints = Array.isArray(data.painPoints) ? data.painPoints.join(', ') : (data.painPoints || 'None');
      const slackText = [
        `🎯 *New AI Readiness Assessment*`,
        `*Company:* ${companyName}`,
        `*Contact:* ${contactName}`,
        `*Email:* ${contactEmail}`,
        contactPhone ? `*Phone:* ${contactPhone}` : null,
        `*Business Type:* ${businessType}`,
        `*Pain Points:* ${painPoints}`,
      ].filter(Boolean).join('\n');

      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: slackText }),
      });
      console.log('Slack notification sent');
    } catch (error) {
      console.error('Slack webhook error:', error.message);
    }
  }

  // Always return success to the user
  return res.status(200).json({ success: true });
}

function buildEmailHtml(data) {
  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const row = (label, value) => {
    if (!value || value === '—') return '';
    return `<tr><td style="padding:8px 12px;color:#888;font-size:14px;border-bottom:1px solid #f0f0f0;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:8px 12px;color:#333;font-size:14px;border-bottom:1px solid #f0f0f0;">${value}</td></tr>`;
  };

  const sectionHeader = (title) =>
    `<tr><td colspan="2" style="padding:20px 12px 8px;font-size:13px;font-weight:700;color:#1B3A5C;text-transform:uppercase;letter-spacing:1.5px;border-bottom:2px solid #C9A84C;">${title}</td></tr>`;

  // Build all rows
  let rows = '';

  // Contact & Business Info
  rows += sectionHeader('Contact & Business Info');
  rows += row('Company', data.companyName);
  rows += row('Contact', data.contactName);
  rows += row('Email', data.contactEmail);
  rows += row('Phone', data.contactPhone);
  rows += row('Business Type', data.businessType);
  rows += row('Team Size', data.teamSize);
  rows += row('Annual Revenue', data.revenue);
  rows += row('Current Software', data.currentSoftware);
  rows += row('Comm Tools', data.commTools);

  // Industry-specific
  if (data.industryData && Object.keys(data.industryData).length > 0) {
    rows += sectionHeader('Industry Details');
    for (const [key, value] of Object.entries(data.industryData)) {
      rows += row(key, value);
    }
  }

  // Pain points
  rows += sectionHeader('Pain Points & Priorities');
  rows += row('Weekly Admin Hours', data.adminHours);
  rows += row('Pain Points', Array.isArray(data.painPoints) ? data.painPoints.join(', ') : data.painPoints);
  rows += row('Task to Eliminate', data.wishGone);
  rows += row('Prior AI Experience', data.priorAI);

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1B3A5C,#244b73);padding:32px 24px;border-radius:12px 12px 0 0;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#fff;">Let<span style="color:#C9A84C;">Atlas</span></div>
      <div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:4px;">New AI Readiness Assessment</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:8px;">${timestamp} CT</div>
    </div>

    <!-- Body -->
    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <table cellpadding="0" cellspacing="0" width="100%">
        ${rows}
      </table>

      ${data.contactEmail && data.contactEmail !== 'Not provided' ? `
      <div style="margin-top:24px;text-align:center;">
        <a href="mailto:${data.contactEmail}" style="display:inline-block;background:#C9A84C;color:#1B3A5C;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">Reply to ${data.contactName || 'Lead'} →</a>
      </div>
      ` : ''}
    </div>

    <div style="text-align:center;padding:16px;font-size:11px;color:#999;">
      Submitted via letatlas.ai AI Readiness Assessment
    </div>
  </div>
</body>
</html>`;
}

import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface SendInviteEmailParams {
  to: string;
  inviterName: string;
  inviteLink: string;
}

interface InviteEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHeaderValue(value: unknown): string {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function buildInviteEmailTemplate(
  inviterName: string,
  inviteLink: string
): InviteEmailTemplate {
  const safeInviterName = escapeHtml(inviterName || "Your friend");
  const safeInviteLink = escapeHtml(inviteLink);
  const preheader =
    "Join DooSplit and start splitting expenses with your friends in seconds.";
  const subjectName = sanitizeHeaderValue(inviterName || "Your friend");

  return {
    subject: `${subjectName} invited you to join DooSplit`,
    text: `${subjectName} invited you to join DooSplit.\n\nCreate your account: ${inviteLink}\n\nThis invitation link expires in 7 days.`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DooSplit Invitation</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">
    ${preheader}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dbe5eb;">
          <tr>
            <td style="background:linear-gradient(135deg,#0f766e,#0f766e 55%,#115e59);padding:36px 32px;text-align:center;">
              <div style="height:46px;width:46px;border-radius:12px;background-color:rgba(255,255,255,0.16);display:inline-block;line-height:46px;text-align:center;color:#ffffff;font-size:20px;font-weight:700;margin-bottom:12px;">
                DS
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.2;font-weight:700;">You are invited</h1>
              <p style="margin:10px 0 0 0;color:#d6f5f1;font-size:15px;line-height:1.5;">
                Split expenses clearly, settle faster, stay organized.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 32px 16px 32px;">
              <p style="margin:0 0 14px 0;color:#0f172a;font-size:16px;line-height:1.6;">
                <strong>${safeInviterName}</strong> invited you to join <strong>DooSplit</strong>.
              </p>
              <p style="margin:0 0 22px 0;color:#334155;font-size:15px;line-height:1.6;">
                Track shared expenses, see exactly who owes what, and settle up without confusion.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="padding:12px 14px;border:1px solid #dbe5eb;border-radius:8px;background-color:#f8fafc;">
                    <p style="margin:0;color:#334155;font-size:14px;line-height:1.5;">
                      Invitation link expires in <strong>7 days</strong>.
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 18px auto;">
                <tr>
                  <td align="center" style="border-radius:10px;background-color:#0f766e;">
                    <a href="${safeInviteLink}" target="_blank" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0 0;color:#0f766e;font-size:13px;line-height:1.6;word-break:break-all;">
                <a href="${safeInviteLink}" target="_blank" style="color:#0f766e;text-decoration:underline;">${safeInviteLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 22px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5;">
                DooSplit - Split expenses, not friendships
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,
  };
}

export async function sendInviteEmail({
  to,
  inviterName,
  inviteLink,
}: SendInviteEmailParams) {
  const template = buildInviteEmailTemplate(inviterName, inviteLink);

  await transporter.sendMail({
    from: `"DooSplit" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}
/**
 * Send payment reminder
 */
interface SendPaymentReminderParams {
  to: string;
  fromUserName: string;
  toUserName: string;
  amount: number;
  currency: string;
  message?: string;
}

/**
 * Send email verification
 */
interface SendEmailVerificationParams {
  to: string;
  userName: string;
  verificationUrl: string;
}

export async function sendEmailVerification({
  to,
  userName,
  verificationUrl,
}: SendEmailVerificationParams) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 48px 40px; text-align: center;">
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 16px; padding: 14px; margin-bottom: 20px;">
                <span style="font-size: 40px;">✅</span>
              </div>
              <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0; font-weight: 700;">Verify Your Email</h1>
              <p style="color: rgba(255,255,255,0.85); font-size: 16px; margin: 0;">Welcome to DooSplit!</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
                Hi ${userName},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 28px 0;">
                Welcome to DooSplit! To get started, please verify your email address by clicking the button below:
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${verificationUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 16px 48px; border-radius: 12px; box-shadow: 0 4px 14px rgba(16,185,129,0.4);">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 24px 0 0 0; line-height: 1.6;">
                Or copy this link into your browser:<br />
                <a href="${verificationUrl}" style="color: #10b981; word-break: break-all;">${verificationUrl}</a>
              </p>

              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 32px 0;">
                <p style="color: #92400e; font-size: 14px; margin: 0; line-height: 1.6;">
                  <strong>⚠️ Security Notice:</strong> This verification link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 40px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #d1d5db; font-size: 11px; margin: 0;">
                DooSplit — Split expenses, not friendships ❤️
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  await transporter.sendMail({
    from: `"DooSplit" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: "Welcome to DooSplit - Verify Your Email",
    html,
  });
}

export async function sendPaymentReminder({
  to,
  fromUserName,
  toUserName,
  amount,
  currency,
  message,
}: SendPaymentReminderParams) {
  const formattedAmount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
  }).format(amount);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 48px 40px; text-align: center;">
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 16px; padding: 14px; margin-bottom: 20px;">
                <span style="font-size: 40px;">💰</span>
              </div>
              <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0; font-weight: 700;">Payment Reminder</h1>
              <p style="color: rgba(255,255,255,0.85); font-size: 16px; margin: 0;">${fromUserName} is reminding you</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
                Hi ${toUserName},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 28px 0;">
                ${fromUserName} is reminding you about a payment of <strong style="color: #f59e0b; font-size: 18px;">${formattedAmount}</strong>.
              </p>

              ${message ? `
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0;">
                <p style="color: #92400e; font-size: 14px; margin: 0; line-height: 1.6;">
                  <strong>💬 Message:</strong> ${message}
                </p>
              </div>
              ` : ''}

              <div style="background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
                <p style="color: #0c4a6e; font-size: 14px; margin: 0 0 12px 0;">
                  <strong>Amount Due:</strong>
                </p>
                <p style="color: #0c4a6e; font-size: 24px; font-weight: 700; margin: 0; font-family: 'Monaco', 'Menlo', monospace;">
                  ${formattedAmount}
                </p>
              </div>

              <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 24px 0 0 0;">
                Log in to DooSplit to settle up with ${fromUserName}.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 40px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #d1d5db; font-size: 11px; margin: 0;">
                DooSplit — Split expenses, not friendships ❤️
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  await transporter.sendMail({
    from: `"DooSplit" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: `Payment Reminder from ${fromUserName} - ${formattedAmount}`,
    html,
  });
}

/**
 * Send password reset email
 */
interface SendPasswordResetEmailParams {
  to: string;
  userName: string;
  resetLink: string;
  isFirebaseUser?: boolean;
}

export async function sendPasswordResetEmail({
  to,
  userName,
  resetLink,
  isFirebaseUser = false,
}: SendPasswordResetEmailParams) {
  const html = isFirebaseUser ? `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

          <tr>
            <td style="background: linear-gradient(135deg, #4285f4 0%, #34a853 100%); padding: 48px 40px; text-align: center;">
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 16px; padding: 14px; margin-bottom: 20px;">
                <span style="font-size: 40px;">🔵</span>
              </div>
              <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0; font-weight: 700;">Google Account Login</h1>
              <p style="color: rgba(255,255,255,0.85); font-size: 16px; margin: 0;">Your DooSplit account uses Google sign-in</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
                Hi ${userName},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 28px 0;">
                Your DooSplit account was created using Google sign-in. You don't have a password set for this account.
              </p>

              <div style="background: #eff6ff; border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
                <p style="color: #1e40af; font-size: 18px; margin: 0 0 8px 0; font-weight: 600;">🔵 Use Google Sign-In</p>
                <p style="color: #3730a3; font-size: 14px; margin: 0; line-height: 1.6;">
                  To access your account, please use the "Continue with Google" button on the login page.
                </p>
              </div>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/login" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4285f4, #34a853); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 16px 48px; border-radius: 12px; box-shadow: 0 4px 14px rgba(66,133,244,0.4);">
                      Go to Login Page
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 32px 0;">
                <p style="color: #92400e; font-size: 14px; margin: 0; line-height: 1.6;">
                  <strong>💡 Want to use email/password?</strong> You can set a password by logging in with Google first, then going to Settings to add a password.
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 40px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #d1d5db; font-size: 11px; margin: 0;">
                DooSplit — Split expenses, not friendships ❤️
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  ` : `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); padding: 48px 40px; text-align: center;">
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 16px; padding: 14px; margin-bottom: 20px;">
                <span style="font-size: 40px;">🔐</span>
              </div>
              <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0; font-weight: 700;">Password Reset</h1>
              <p style="color: rgba(255,255,255,0.85); font-size: 16px; margin: 0;">Reset your DooSplit password</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
                Hi ${userName},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 28px 0;">
                We received a request to reset your password for your DooSplit account. Click the button below to create a new password:
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${resetLink}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #ef4444); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 16px 48px; border-radius: 12px; box-shadow: 0 4px 14px rgba(245,158,11,0.4);">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 24px 0 0 0; line-height: 1.6;">
                Or copy this link into your browser:<br />
                <a href="${resetLink}" style="color: #f59e0b; word-break: break-all;">${resetLink}</a>
              </p>

              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 32px 0;">
                <p style="color: #92400e; font-size: 14px; margin: 0; line-height: 1.6;">
                  <strong>⚠️ Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 40px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0 0 4px 0;">
                This reset link expires in 1 hour for security.
              </p>
              <p style="color: #d1d5db; font-size: 11px; margin: 0;">
                DooSplit — Split expenses, not friendships ❤️
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  await transporter.sendMail({
    from: `"DooSplit Security" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: isFirebaseUser ? "DooSplit Google Account Login Information 🔵" : "Reset your DooSplit password 🔐",
    html,
  });
}

/**
 * Send expense notification email
 */
interface SendExpenseNotificationParams {
  to: string;
  userName: string;
  expenseDescription: string;
  amount: number;
  currency: string;
  paidBy: string;
  yourShare: number;
  groupName?: string;
}

export async function sendExpenseNotification({
  to,
  userName,
  expenseDescription,
  amount,
  currency,
  paidBy,
  yourShare,
  groupName,
}: SendExpenseNotificationParams) {
  const formattedAmount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency,
  }).format(amount);

  const formattedShare = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency,
  }).format(yourShare);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 48px 40px; text-align: center;">
              <span style="font-size: 48px; display: block; margin-bottom: 16px;">💸</span>
              <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 8px 0; font-weight: 700;">New Expense Added</h1>
              <p style="color: rgba(255,255,255,0.85); font-size: 16px; margin: 0;">You've been added to an expense</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
                Hi ${userName},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 28px 0;">
                <strong>${paidBy}</strong> added a new expense${groupName ? ` in <strong>${groupName}</strong>` : ""}:
              </p>

              <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <p style="color: #64748b; font-size: 14px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">Expense Details</p>
                <h2 style="color: #1e293b; font-size: 20px; margin: 0 0 16px 0; font-weight: 600;">${expenseDescription}</h2>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                  <span style="color: #64748b; font-size: 14px;">Total Amount:</span>
                  <span style="color: #1e293b; font-size: 18px; font-weight: 600;">${formattedAmount}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                  <span style="color: #64748b; font-size: 14px;">Your Share:</span>
                  <span style="color: #6366f1; font-size: 20px; font-weight: 700;">${formattedShare}</span>
                </div>
              </div>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/expenses" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 12px;">
                      View Expense
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 40px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #d1d5db; font-size: 11px; margin: 0;">
                DooSplit — Split expenses, not friendships ❤️
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  await transporter.sendMail({
    from: `"DooSplit" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: `💸 ${paidBy} added an expense: ${expenseDescription}`,
    html,
  });
}

/**
 * Send settlement notification email
 */
interface SendSettlementNotificationParams {
  to: string;
  userName: string;
  paidBy: string;
  amount: number;
  currency: string;
}

export async function sendSettlementNotification({
  to,
  userName,
  paidBy,
  amount,
  currency,
}: SendSettlementNotificationParams) {
  const formattedAmount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency,
  }).format(amount);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 48px 40px; text-align: center;">
              <span style="font-size: 48px; display: block; margin-bottom: 16px;">✅</span>
              <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 8px 0; font-weight: 700;">Payment Recorded</h1>
              <p style="color: rgba(255,255,255,0.85); font-size: 16px; margin: 0;">A settlement has been recorded</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
                Hi ${userName},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 28px 0;">
                <strong>${paidBy}</strong> has recorded a payment to you:
              </p>

              <div style="background: #f0fdf4; border-radius: 12px; padding: 32px; margin-bottom: 24px; text-align: center;">
                <p style="color: #166534; font-size: 14px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">Payment Amount</p>
                <p style="color: #15803d; font-size: 36px; margin: 0; font-weight: 700;">${formattedAmount}</p>
              </div>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settlements" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 12px;">
                      View Settlement
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 40px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #d1d5db; font-size: 11px; margin: 0;">
                DooSplit — Split expenses, not friendships ❤️
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  await transporter.sendMail({
    from: `"DooSplit" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: `✅ ${paidBy} recorded a payment of ${formattedAmount}`,
    html,
  });
}

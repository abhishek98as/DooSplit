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

function getEmailAvatarStyles(identifier: string) {
  const colors = [
    { bg: "#EF4444", text: "#FFFFFF" }, // Red
    { bg: "#3B82F6", text: "#FFFFFF" }, // Blue
    { bg: "#10B981", text: "#FFFFFF" }, // Green
    { bg: "#F59E0B", text: "#FFFFFF" }, // Yellow
    { bg: "#8B5CF6", text: "#FFFFFF" }, // Purple
    { bg: "#EC4899", text: "#FFFFFF" }, // Pink
    { bg: "#6366F1", text: "#FFFFFF" }, // Indigo
  ];
  let sum = 0;
  for (let i = 0; i < identifier.length; i++) {
    sum += identifier.charCodeAt(i);
  }
  return colors[sum % colors.length];
}

function buildInviteEmailTemplate(
  inviterName: string,
  inviteLink: string,
  to: string
): InviteEmailTemplate {
  const safeInviterName = escapeHtml(inviterName || "Your friend");
  const safeInviteLink = escapeHtml(inviteLink);
  const subjectName = sanitizeHeaderValue(inviterName || "Your friend");
  
  let inviteOrigin = "";
  try { inviteOrigin = new URL(inviteLink).origin; } catch { inviteOrigin = ""; }
  const appUrl = inviteOrigin || "https://doosplit.vercel.app";
  const safeAppUrl = escapeHtml(appUrl);

  // Warm Modern theme colors matching the app
  const coral = "#FF5C39";
  const coralDark = "#E84A28";
  const warmBg = "#F7F4EE";
  const warmText = "#1A1612";
  const warmMuted = "#756B5E";
  const warmBorder = "#E8E0D2";

  // Dynamic Avatar data
  const inviterAvatar = getEmailAvatarStyles(inviterName || "Someone");
  const friendPrefix = to.split("@")[0] || "Friend";
  const friendAvatar = getEmailAvatarStyles(friendPrefix);
  
  const inviterInitials = (inviterName || "U").substring(0, 2).toUpperCase();
  const friendInitials = friendPrefix.substring(0, 2).toUpperCase();
  const friendLabel = friendPrefix.length > 8 ? `${friendPrefix.substring(0, 7)}...` : friendPrefix;

  const preheader = `${safeInviterName} invited you to split expenses on DooSplit.`;

  return {
    subject: `${subjectName} invited you to join DooSplit`,
    text: [
      `${subjectName} invited you to join DooSplit — the easy way to split expenses with friends.`,
      ``,
      `Accept your invitation here:`,
      `${inviteLink}`,
      ``,
      `This invitation link expires in 7 days.`,
      ``,
      `What is DooSplit?`,
      `Track shared expenses, see exactly who owes what, and settle up without confusion — all in one place.`,
      ``,
      `— The DooSplit Team`,
      `${appUrl}`,
    ].join("\n"),
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>You're invited to DooSplit</title>
</head>
<body style="margin:0;padding:0;background-color:${warmBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <!-- Hidden preheader for email clients -->
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;font-size:1px;color:${warmBg};">
    ${preheader}&#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${warmBg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border-radius:24px;overflow:hidden;border:1px solid ${warmBorder};box-shadow: 0 4px 20px rgba(26,22,18,0.05);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,${coral},${coralDark});padding:40px 36px;text-align:center;">
              <div style="display:inline-block;width:52px;height:52px;border-radius:16px;background-color:rgba(255,255,255,0.18);line-height:52px;text-align:center;margin-bottom:14px;">
                <span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-1px;">DS</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.2;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                You're Invited!
              </h1>
              <p style="margin:8px 0 0 0;color:rgba(255,255,255,0.9);font-size:15px;line-height:1.5;">
                Track shared expenses. Stay settled.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 36px 24px 36px;">
              
              <!-- Connection Avatars Layout -->
              <table role="presentation" align="center" cellspacing="0" cellpadding="0" style="margin:0 auto 32px auto;">
                <tr>
                  <td align="center" style="vertical-align:middle;">
                    <div style="width:56px;height:56px;border-radius:50%;background-color:${inviterAvatar.bg};color:${inviterAvatar.text};line-height:56px;text-align:center;font-size:20px;font-weight:700;font-family:sans-serif;box-shadow:0 4px 10px rgba(0,0,0,0.08);">
                      ${inviterInitials}
                    </div>
                    <div style="margin-top:8px;color:${warmText};font-size:12px;font-weight:600;font-family:sans-serif;text-align:center;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      ${safeInviterName}
                    </div>
                  </td>
                  <td style="padding:0 20px;vertical-align:middle;text-align:center;">
                    <div style="font-size:24px;color:${coral};line-height:1;font-weight:bold;font-family:sans-serif;">➔</div>
                  </td>
                  <td align="center" style="vertical-align:middle;">
                    <div style="width:56px;height:56px;border-radius:50%;background-color:${friendAvatar.bg};color:${friendAvatar.text};line-height:56px;text-align:center;font-size:20px;font-weight:700;font-family:sans-serif;box-shadow:0 4px 10px rgba(0,0,0,0.08);border:2px dashed ${coral};">
                      ${friendInitials}
                    </div>
                    <div style="margin-top:8px;color:${warmMuted};font-size:12px;font-weight:500;font-family:sans-serif;text-align:center;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      ${friendLabel}
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px 0;color:${warmText};font-size:16px;line-height:1.6;">
                Hi there,
              </p>
              <p style="margin:0 0 24px 0;color:${warmText};font-size:16px;line-height:1.6;">
                <strong>${safeInviterName}</strong> has invited you to join <strong>DooSplit</strong> — a modern, offline-first app to split expenses with friends, roommates, and groups without the awkwardness.
              </p>

              <!-- Feature highlights -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 32px 0;">
                <tr>
                  <td style="padding:10px 0;font-size:15px;line-height:1.5;">
                    <span style="color:${coral};font-size:16px;font-weight:800;padding-right:8px;">✓</span>
                    <span style="color:${warmText};">Track who owes what — instantly</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;font-size:15px;line-height:1.5;">
                    <span style="color:${coral};font-size:16px;font-weight:800;padding-right:8px;">✓</span>
                    <span style="color:${warmText};">Split equally or by custom weights</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;font-size:15px;line-height:1.5;">
                    <span style="color:${coral};font-size:16px;font-weight:800;padding-right:8px;">✓</span>
                    <span style="color:${warmText};">Settle up in one tap via simple offline logs</span>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 24px auto;">
                <tr>
                  <td align="center" style="border-radius:14px;background:linear-gradient(135deg,${coral},${coralDark});box-shadow:0 4px 16px rgba(255,92,57,0.35);">
                    <a href="${safeInviteLink}" target="_blank" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                      Accept Invitation →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="padding:14px 16px;border:1px solid ${warmBorder};border-radius:12px;background-color:${warmBg};">
                    <p style="margin:0;color:${warmMuted};font-size:13px;line-height:1.5;text-align:center;">
                      ⏳ This invitation link will expire in <strong>7 days</strong>.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="margin:0 0 4px 0;color:${warmMuted};font-size:13px;line-height:1.5;text-align:center;">
                Button not working? Copy this link to your browser:
              </p>
              <p style="margin:0;color:${coral};font-size:13px;line-height:1.5;text-align:center;word-break:break-all;">
                ${safeInviteLink}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px;background-color:#FAF8F5;border-top:1px solid ${warmBorder};text-align:center;">
              <p style="margin:0 0 6px 0;color:${warmText};font-size:13px;font-weight:700;">
                DooSplit
              </p>
              <p style="margin:0 0 12px 0;color:${warmMuted};font-size:12px;line-height:1.5;">
                Split expenses, not friendships.
              </p>
              <p style="margin:0;color:#B0A89A;font-size:11px;line-height:1.6;">
                You received this email because ${safeInviterName} invited you to DooSplit.<br/>
                If you did not expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>

        <!-- Legal physical address footer outside card to satisfy spam filters -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin-top:20px;">
          <tr>
            <td style="text-align:center;padding:0 10px;">
              <p style="margin:0;color:#B0A89A;font-size:11px;line-height:1.5;">
                DooSplit Inc. &middot; Bangalore, Karnataka, India &middot; ${safeAppUrl}
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
  const template = buildInviteEmailTemplate(inviterName, inviteLink, to);

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  const fromDomain = fromAddress.includes("@") ? fromAddress.split("@")[1] : "doosplit.vercel.app";
  const messageId = `<invite-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@${fromDomain}>`;

  await transporter.sendMail({
    from: `"DooSplit" <${fromAddress}>`,
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
    headers: {
      "Message-ID": messageId,
      "X-Mailer": "DooSplit",
      "X-Priority": "3",
      "Auto-Submitted": "auto-generated",
      "X-Auto-Response-Suppress": "All",
    },
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

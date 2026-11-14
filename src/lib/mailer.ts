import nodemailer, { type Transporter } from 'nodemailer';

type InvitationEmail = {
  to: string;
  displayName: string;
  username: string;
  token: string;
  roleLabel: string;
  invitedBy: string;
};

type MailResult = { sent: boolean; error?: string };

let cachedTransporter: Transporter | null = null;

export function mailerConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export function mailerAddress(): string {
  return process.env.GMAIL_USER || '';
}

export function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export function invitationLink(username: string, token: string): string {
  const url = new URL('/login', appUrl());
  url.searchParams.set('activate', '1');
  url.searchParams.set('username', username);
  url.searchParams.set('token', token);
  return url.toString();
}

function transporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;
  const secure = (process.env.SMTP_SECURE ?? 'true') !== 'false';
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || (secure ? 465 : 587)),
    secure,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return cachedTransporter;
}

function fromAddress(): string {
  const name = process.env.MAIL_FROM_NAME || 'BMU Secure Database';
  return `"${name}" <${process.env.GMAIL_USER}>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendInvitationEmail(input: InvitationEmail): Promise<MailResult> {
  if (!mailerConfigured()) {
    return { sent: false, error: 'Gmail SMTP is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to .env.' };
  }

  const link = invitationLink(input.username, input.token);
  const name = escapeHtml(input.displayName);
  const username = escapeHtml(input.username);
  const role = escapeHtml(input.roleLabel);
  const invitedBy = escapeHtml(input.invitedBy);

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f3f5f7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#131b24;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e9ee;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(135deg,#6b2a55,#57223f);padding:28px 32px;color:#ffffff;">
                <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#d4ef9a;font-weight:700;">Bayelsa Medical University</div>
                <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:6px;">Secure database invitation</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 32px;">
                <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">Hello <strong>${name}</strong>,</p>
                <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">
                  ${invitedBy} has invited you to the BMU Secure Database as <strong>${role}</strong>.
                  Activate your account to set your password and sign in.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                  <tr>
                    <td style="border-radius:9px;background:#6b2a55;">
                      <a href="${link}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;">Activate my account</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:12px;color:#5f6b78;">If the button does not work, copy this link into your browser:</p>
                <p style="margin:0 0 18px;font-size:11px;word-break:break-all;color:#6b2a55;">${escapeHtml(link)}</p>
                <div style="background:#f7f9fa;border:1px solid #e4e9ee;border-radius:9px;padding:14px 16px;font-size:12px;line-height:1.7;">
                  <div><strong>Username:</strong> ${username}</div>
                  <div><strong>Invitation token:</strong> ${escapeHtml(input.token)}</div>
                  <div style="color:#5f6b78;margin-top:6px;">This invitation expires in 48 hours and can only be used once.</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;border-top:1px solid #e4e9ee;color:#5f6b78;font-size:11px;">
                If you were not expecting this invitation, you can safely ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hello ${input.displayName},`,
    '',
    `${input.invitedBy} has invited you to the BMU Secure Database as ${input.roleLabel}.`,
    '',
    `Activate your account: ${link}`,
    '',
    `Username: ${input.username}`,
    `Invitation token: ${input.token}`,
    '',
    'This invitation expires in 48 hours and can only be used once.',
  ].join('\n');

  try {
    await transporter().sendMail({
      from: fromAddress(),
      to: input.to,
      subject: 'Your BMU Secure Database invitation',
      text,
      html,
    });
    return { sent: true };
  } catch (error) {
    console.error('BMU invitation email failed:', (error as Error).message);
    return { sent: false, error: (error as Error).message };
  }
}

export async function sendTestEmail(to: string): Promise<MailResult> {
  if (!mailerConfigured()) {
    return { sent: false, error: 'Gmail SMTP is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to .env.' };
  }
  try {
    await transporter().sendMail({
      from: fromAddress(),
      to,
      subject: 'BMU Secure Database SMTP test',
      text: 'This is a test message from the BMU Secure Database. Gmail SMTP is configured correctly.',
      html: '<p style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;">This is a test message from the <strong>BMU Secure Database</strong>. Gmail SMTP is configured correctly.</p>',
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, error: (error as Error).message };
  }
}

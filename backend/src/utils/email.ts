import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../config/logger";

const RESEND_API_URL = "https://api.resend.com/emails";

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: parseInt(env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    })
  : null;

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

type EmailProvider = "resend" | "smtp" | "none";

interface EmailResult {
  provider: EmailProvider;
  /** The actual from-address used (falls back to onboarding@resend.dev when the configured domain is unverified). */
  from: string;
  /** True when the configured FROM_EMAIL domain was rejected and the fallback sender was used. */
  fellBackFromDomain: boolean;
}

const RESEND_FALLBACK_FROM = "NexusAI <onboarding@resend.dev>";

async function resendSend(from: string, body: Omit<EmailMessage, "from">): Promise<Response> {
  return fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, ...body }),
  });
}

function isDomainVerificationError(response: Response, body: string): boolean {
  return response.status === 403 && /not verified|domain.*verif/i.test(body);
}

/** Returns which provider handled the send, so callers can report it accurately. */
async function sendEmail({ to, subject, html }: EmailMessage): Promise<EmailResult> {
  // Preferred path: Resend REST API (works with a single API key).
  if (env.RESEND_API_KEY) {
    const preferredFrom = env.FROM_EMAIL || RESEND_FALLBACK_FROM;
    let response = await resendSend(preferredFrom, { to, subject, html });
    let body = await response.text().catch(() => "");

    // FROM_EMAIL may point at a domain the Resend account hasn't verified
    // (e.g. noreply@nexusai.com). onboarding@resend.dev always delivers to the
    // account owner, so fall back to it and keep the mail working.
    if (!response.ok && isDomainVerificationError(response, body)) {
      logger.warn(`FROM_EMAIL domain not verified in Resend (${preferredFrom}) — falling back to ${RESEND_FALLBACK_FROM}`);
      response = await resendSend(RESEND_FALLBACK_FROM, { to, subject, html });
      body = await response.text().catch(() => "");
      if (response.ok) {
        return { provider: "resend", from: RESEND_FALLBACK_FROM, fellBackFromDomain: true };
      }
    }

    if (!response.ok) {
      throw new Error(`Resend error ${response.status}: ${body.slice(0, 200)}`);
    }
    return { provider: "resend", from: preferredFrom, fellBackFromDomain: false };
  }

  // Fallback: SMTP via nodemailer.
  if (!transporter) {
    logger.warn("No email provider configured (set RESEND_API_KEY or SMTP_HOST), skipping email");
    return { provider: "none", from: "", fellBackFromDomain: false };
  }

  await transporter.sendMail({
    from: env.FROM_EMAIL || "noreply@nexusai.com",
    to,
    subject,
    html,
  });
  return { provider: "smtp", from: env.FROM_EMAIL || "noreply@nexusai.com", fellBackFromDomain: false };
}

export interface TestEmailResult {
  provider: EmailProvider;
  to: string;
  from: string;
  fellBackFromDomain: boolean;
}

export async function sendTestEmail(email: string): Promise<TestEmailResult> {
  const { provider, from, fellBackFromDomain } = await sendEmail({
    to: email,
    subject: "NexusAI — test email",
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto;">
        <div style="padding: 20px 24px; background: #7c3aed; border-radius: 12px 12px 0 0; color: white;">
          <strong style="font-size: 16px;">NexusAI</strong>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="margin: 0 0 8px; font-size: 18px; color: #111827;">Test email</h2>
          <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #374151;">
            This is a test email from your <strong>Settings → Integrations</strong> page.
            It confirms NexusAI's email provider is configured and delivering correctly.
          </p>
          <p style="margin: 0; font-size: 12px; color: #6b7280;">Sent to ${email}</p>
        </div>
      </div>
    `,
  });
  return { provider, to: email, from, fellBackFromDomain };
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;

  try {
    await sendEmail({
      to: email,
      subject: "Verify your NexusAI account",
      html: `
        <h1>Welcome to NexusAI!</h1>
        <p>Click the link below to verify your email:</p>
        <a href="${verifyUrl}" style="padding: 12px 24px; background: #7c3aed; color: white; text-decoration: none; border-radius: 8px;">Verify Email</a>
        <p>Or copy this URL: ${verifyUrl}</p>
      `,
    });
  } catch (error) {
    logger.error("Failed to send verification email:", error);
    throw new Error("Failed to send verification email");
  }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;

  try {
    await sendEmail({
      to: email,
      subject: "Reset your NexusAI password",
      html: `
        <h1>Password Reset</h1>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="padding: 12px 24px; background: #7c3aed; color: white; text-decoration: none; border-radius: 8px;">Reset Password</a>
        <p>This link expires in 1 hour.</p>
      `,
    });
  } catch (error) {
    logger.error("Failed to send password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
}

/**
 * Project collaboration invitation. Best-effort by design: the invitation
 * record is the source of truth, so an email failure never blocks or rolls
 * back the invite itself — the recipient still sees it pending on the
 * Projects page. Delivers through the same Resend/SMTP pipeline as the
 * verification and reset emails (skipped entirely when no provider is set).
 */
export async function sendProjectInvitationEmail(
  email: string,
  projectName: string,
  inviterName: string | null,
  role: string
): Promise<void> {
  const projectsUrl = `${env.FRONTEND_URL}/projects`;

  try {
    await sendEmail({
      to: email,
      subject: `You've been invited to “${projectName}” on NexusAI`,
      html: `
        <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="padding: 20px 24px; background: #7c3aed; border-radius: 12px 12px 0 0; color: white;">
            <strong style="font-size: 16px;">NexusAI</strong>
          </div>
          <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="margin: 0 0 8px; font-size: 18px; color: #111827;">You've been invited to a project</h2>
            <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #374151;">
              <strong>${inviterName || "A collaborator"}</strong> invited you to join
              <strong>“${projectName}”</strong> as an <strong>${role}</strong>.
            </p>
            <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #374151;">
              Open your Projects page to accept or decline the invitation — you'll
              be added as a member once you accept.
            </p>
            <a href="${projectsUrl}" style="display: inline-block; padding: 12px 24px; background: #7c3aed; color: white; text-decoration: none; border-radius: 8px; font-size: 14px;">
              Open Projects
            </a>
            <p style="margin: 20px 0 0; font-size: 12px; color: #6b7280;">
              Or copy this URL: ${projectsUrl}
            </p>
          </div>
        </div>
      `,
    });
  } catch (error) {
    // Never fail the invitation because the email couldn't be delivered.
    logger.error(`Failed to send project invitation email to ${email}:`, error);
  }
}

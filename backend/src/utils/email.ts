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

async function sendEmail({ to, subject, html }: EmailMessage): Promise<void> {
  // Preferred path: Resend REST API (works with a single API key).
  if (env.RESEND_API_KEY) {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL || "NexusAI <onboarding@resend.dev>",
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Resend error ${response.status}: ${details.slice(0, 200)}`);
    }
    return;
  }

  // Fallback: SMTP via nodemailer.
  if (!transporter) {
    logger.warn("No email provider configured (set RESEND_API_KEY or SMTP_HOST), skipping email");
    return;
  }

  await transporter.sendMail({
    from: env.FROM_EMAIL || "noreply@nexusai.com",
    to,
    subject,
    html,
  });
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

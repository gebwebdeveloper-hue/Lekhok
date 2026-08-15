import nodemailer from "nodemailer";
import https from "https";
import { env } from "../config/env.js";

let transport;

function getTransport() {
  if (transport) return transport;

  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) {
    transport = nodemailer.createTransport({ jsonTransport: true });
    return transport;
  }

  transport = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: { user: env.smtp.user, pass: env.smtp.pass }
  });

  return transport;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sendEmailViaResend({ to, subject, html, text, attachments }) {
  return new Promise((resolve, reject) => {
    const recipientList = Array.isArray(to) ? to : [to];
    const data = JSON.stringify({
      from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
      to: recipientList,
      subject,
      html,
      text,
      ...(attachments?.length ? { attachments } : {})
    });

    const options = {
      hostname: "api.resend.com",
      port: 443,
      path: "/emails",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.resendApiKey}`,
        "Content-Length": Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => (responseBody += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(responseBody));
          } catch (e) {
            resolve(responseBody);
          }
        } else {
          reject(new Error(`Resend API error: ${res.statusCode} - ${responseBody}`));
        }
      });
    });

    req.on("error", (error) => reject(error));
    req.write(data);
    req.end();
  });
}

export async function sendDashboardEmail({ to, subject, html, text, attachments }) {
  const recipientList = Array.isArray(to) ? to : [to];

  if (env.resendApiKey) {
    try {
      return await sendEmailViaResend({ to: recipientList, subject, html, text, attachments });
    } catch (err) {
      console.error("[DashboardMail] Resend error, falling back to SMTP:", err);
    }
  }

  try {
    const tp = getTransport();
    return await tp.sendMail({
      from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
      to: Array.isArray(to) ? to.join(",") : to,
      subject,
      html,
      text,
      attachments
    });
  } catch (err) {
    console.error("[DashboardMail] SMTP error:", err);
    throw err;
  }
}

/**
 * Send Author Portal Credentials Email
 */
export async function sendAuthorCredentialsEmail({
  email,
  name,
  password,
  loginUrl = "https://authordashboard.netlify.app"
}) {
  if (!email) return { skipped: true };

  const subject = `Welcome Author! Your Login Credentials - Lekhok Tripura Publishers`;
  const htmlContent = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#050505;color:#ffffff;padding:32px;border-radius:18px;max-width:680px;margin:0 auto;border:1px solid #1f2937">
      <div style="text-align:center;padding-bottom:24px;border-bottom:2px solid #d97706;margin-bottom:24px">
        <p style="letter-spacing:0.25em;text-transform:uppercase;color:#f59e0b;font-size:12px;font-weight:bold;margin:0 0 6px">LEKHOK TRIPURA PUBLISHERS</p>
        <h1 style="font-size:26px;color:#ffffff;margin:0;font-weight:800">Welcome to Author Portal ✨</h1>
      </div>

      <div style="background:#0d0d0d;padding:24px;border-radius:14px;border:1px solid #1e293b;margin-bottom:24px">
        <h2 style="font-size:18px;color:#f59e0b;margin:0 0 12px">Dear ${escapeHtml(name || 'Author')},</h2>
        <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0 0 16px">
          Congratulations on registering with <strong>Lekhok Tripura Publishers</strong>! Your personal Author & Royalties Dashboard has been created.
        </p>
        <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0">
          You can now log in to track your book publishing workflow (ISBN, cover, printing), sales performance, royalty earnings, and payments.
        </p>
      </div>

      <div style="background:#111827;padding:24px;border-radius:14px;border:1px solid #374151;margin-bottom:24px">
        <h3 style="font-size:14px;color:#f59e0b;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 14px">🔑 Your Login Credentials</h3>
        <table style="width:100%;font-size:14px;color:#cbd5e1;border-collapse:collapse">
          <tr>
            <td style="padding:8px 0;color:#9ca3af;width:140px">Portal URL:</td>
            <td style="padding:8px 0;text-align:right"><a href="${loginUrl}" style="color:#38bdf8;font-weight:bold;text-decoration:none">${loginUrl}</a></td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#9ca3af">Email / Login ID:</td>
            <td style="padding:8px 0;text-align:right;font-weight:bold;color:#ffffff">${escapeHtml(email)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#9ca3af">Password:</td>
            <td style="padding:8px 0;text-align:right;font-weight:bold;font-family:monospace;font-size:16px;color:#f59e0b">${escapeHtml(password)}</td>
          </tr>
        </table>
      </div>

      <div style="text-align:center;margin-bottom:24px">
        <a href="${loginUrl}" style="background:#d97706;color:#ffffff;padding:14px 32px;border-radius:12px;font-weight:bold;text-decoration:none;display:inline-block;font-size:15px">Log In to Author Dashboard</a>
      </div>

      <div style="border-top:1px solid #1f2937;padding-top:20px;text-align:center;font-size:12px;color:#64748b">
        <p>If you have any questions, reach out to us at support@lekhoktripura.in</p>
        <p style="margin-top:4px">&copy; ${new Date().getFullYear()} Lekhok Tripura Publishers. Agartala, Tripura.</p>
      </div>
    </div>
  `;

  const textContent = `Welcome Author!\n\nPortal: ${loginUrl}\nEmail: ${email}\nPassword: ${password}\n\nLog in now to view your royalty dashboard.`;

  return await sendDashboardEmail({ to: email, subject, html: htmlContent, text: textContent });
}

/**
 * Send Reprint Alert Email to Publisher Admin
 */
export async function sendReprintRequestEmail({ authorName, authorEmail, bookTitle }) {
  const recipients = env.adminEmails;
  if (!recipients.length) return { skipped: true };

  const subject = `⚠️ Reprint Request Received - ${bookTitle} (${authorName})`;
  const htmlContent = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#050505;color:#ffffff;padding:28px;border-radius:18px;max-width:680px;margin:0 auto;border:1px solid #1f2937">
      <h2 style="color:#f59e0b;margin:0 0 12px">⚠️ Book Reprint Requested</h2>
      <p style="color:#cbd5e1;font-size:14px">Author <strong>${escapeHtml(authorName)}</strong> (${escapeHtml(authorEmail)}) requested a book reprint.</p>
      <div style="background:#111827;padding:16px;border-radius:12px;margin:16px 0 border:1px solid #374151">
        <p style="color:#ffffff;margin:0;font-weight:bold">Book Title: ${escapeHtml(bookTitle)}</p>
      </div>
    </div>
  `;
  const textContent = `Reprint Requested for "${bookTitle}" by ${authorName} (${authorEmail}).`;

  return await sendDashboardEmail({ to: recipients, subject, html: htmlContent, text: textContent });
}

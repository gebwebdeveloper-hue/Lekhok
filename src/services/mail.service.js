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

export function sendEmailViaResend({ to, subject, html, text }) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      from: env.smtp.from || "LEKHAK <no-reply@lekhoktripura.in>",
      to,
      subject,
      html,
      text
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
      res.on("data", (chunk) => responseBody += chunk);
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

    req.on("error", (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

export async function sendOtpEmail(email, otp) {
  const htmlContent = `
    <div style="font-family:Inter,Arial,sans-serif;background:#050505;color:#ffffff;padding:32px;border-radius:16px">
      <p style="letter-spacing:0.24em;text-transform:uppercase;color:#8be9ff;font-size:12px">LEKHAK secure login</p>
      <h1 style="font-size:36px;margin:12px 0">${otp}</h1>
      <p style="color:#c9c9c9">Use this OTP to sign in. It expires in ${env.otpExpiresMinutes} minutes.</p>
    </div>
  `;
  const textContent = `Your LEKHAK OTP is ${otp}. It expires in ${env.otpExpiresMinutes} minutes.`;

  if (env.resendApiKey) {
    try {
      console.log(`[Email] Sending OTP to ${email} via Resend...`);
      const result = await sendEmailViaResend({
        to: [email],
        subject: "Your LEKHAK login OTP",
        html: htmlContent,
        text: textContent
      });
      console.log("[Email] Resend response:", result);
      return result;
    } catch (error) {
      console.error("[Email] Failed to send email via Resend:", error);
      // Fallback to SMTP
    }
  }

  // Fallback to SMTP
  const info = await getTransport().sendMail({
    from: env.smtp.from || "LEKHAK <no-reply@lekhoktripura.in>",
    to: email,
    subject: "Your LEKHAK login OTP",
    html: htmlContent,
    text: textContent
  });

  if (env.nodeEnv !== "production" && info.message) {
    console.log("OTP email preview (SMTP Fallback):", info.message.toString());
  }
}
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function detailRow(label, value) {
  return `
    <tr>
      <td style="padding:10px 12px;color:#94a3b8;border-bottom:1px solid #1f2937;width:180px">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;color:#ffffff;border-bottom:1px solid #1f2937;font-weight:600">${escapeHtml(value || "-")}</td>
    </tr>
  `;
}

export async function sendPhysicalOrderEmail({ purchase, book, user }) {
  const recipients = env.adminEmails;
  if (!recipients.length) {
    console.warn("[Email] Physical order email skipped: ADMIN_EMAILS is not configured.");
    return { skipped: true };
  }

  const address = purchase.deliveryAddress || {};
  const formatLabel = purchase.format === "hardcover" ? "Hardcover" : "Paperback";
  const subject = `New ${formatLabel} delivery request - ${book.title}`;
  const htmlContent = `
    <div style="font-family:Inter,Arial,sans-serif;background:#050505;color:#ffffff;padding:28px;border-radius:18px;max-width:720px">
      <p style="letter-spacing:0.24em;text-transform:uppercase;color:#67e8f9;font-size:12px;margin:0 0 10px">LEKHAK delivery request</p>
      <h1 style="font-size:26px;margin:0 0 6px">${escapeHtml(formatLabel)} Order</h1>
      <p style="color:#a1a1aa;margin:0 0 24px">A reader submitted a physical book delivery request.</p>

      <table style="width:100%;border-collapse:collapse;background:#0d0d0d;border:1px solid #1f2937;border-radius:14px;overflow:hidden">
        ${detailRow("Book", book.title)}
        ${detailRow("Author", book.author)}
        ${detailRow("Format", formatLabel)}
        ${detailRow("Amount", `₹${purchase.amount}`)}
        ${detailRow("Request ID", purchase._id)}
        ${detailRow("Reader Name", user.name)}
        ${detailRow("Reader Email", user.email)}
        ${detailRow("Phone", user.phone)}
        ${detailRow("Age", user.age)}
        ${detailRow("C/O", address.co)}
        ${detailRow("Country", address.country)}
        ${detailRow("District", address.district)}
        ${detailRow("Block", address.block)}
        ${detailRow("PIN", address.pin)}
        ${detailRow("Post Office", address.postOffice)}
        ${detailRow("Nearby Landmark", address.nearbyLocation)}
      </table>
    </div>
  `;

  const textContent = [
    `New ${formatLabel} delivery request`,
    `Book: ${book.title}`,
    `Author: ${book.author}`,
    `Amount: ₹${purchase.amount}`,
    `Request ID: ${purchase._id}`,
    `Reader: ${user.name || "-"}`,
    `Email: ${user.email || "-"}`,
    `Phone: ${user.phone || "-"}`,
    `Age: ${user.age || "-"}`,
    `C/O: ${address.co || "-"}`,
    `Country: ${address.country || "-"}`,
    `District: ${address.district || "-"}`,
    `Block: ${address.block || "-"}`,
    `PIN: ${address.pin || "-"}`,
    `Post Office: ${address.postOffice || "-"}`,
    `Nearby Landmark: ${address.nearbyLocation || "-"}`
  ].join("\n");

  if (env.resendApiKey) {
    try {
      console.log(`[Email] Sending physical order request to admins via Resend...`);
      return await sendEmailViaResend({
        to: recipients,
        subject,
        html: htmlContent,
        text: textContent
      });
    } catch (error) {
      console.error("[Email] Failed to send physical order email via Resend:", error);
    }
  }

  const info = await getTransport().sendMail({
    from: env.smtp.from || "LEKHAK <no-reply@lekhoktripura.in>",
    to: recipients,
    subject,
    html: htmlContent,
    text: textContent
  });

  if (env.nodeEnv !== "production" && info.message) {
    console.log("Physical order email preview (SMTP Fallback):", info.message.toString());
  }

  return info;
}

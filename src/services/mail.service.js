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
import nodemailer from "nodemailer";
import https from "https";
import fs from "fs";
import { env } from "../config/env.js";
import { Subscriber } from "../models/Subscriber.js";

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

export function sendEmailViaResend({ to, subject, html, text, attachments }) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
      to,
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
      <p style="letter-spacing:0.24em;text-transform:uppercase;color:#8be9ff;font-size:12px">LEKHOK TRIPURA SECURE LOGIN</p>
      <h1 style="font-size:36px;margin:12px 0">${otp}</h1>
      <p style="color:#c9c9c9">Use this OTP to sign in. It expires in ${env.otpExpiresMinutes} minutes.</p>
    </div>
  `;
  const textContent = `Your Lekhok Tripura OTP is ${otp}. It expires in ${env.otpExpiresMinutes} minutes.`;

  if (env.resendApiKey) {
    try {
      console.log(`[Email] Sending OTP to ${email} via Resend...`);
      const result = await sendEmailViaResend({
        to: [email],
        subject: "Your Lekhok Tripura login OTP",
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
    from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
    to: email,
    subject: "Your Lekhok Tripura login OTP",
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
      <p style="letter-spacing:0.24em;text-transform:uppercase;color:#67e8f9;font-size:12px;margin:0 0 10px">LEKHOK TRIPURA DELIVERY REQUEST</p>
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
    from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
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


function lightDetailRow(label, value) {
  return `
    <tr>
      <td style="padding:10px 12px;color:#475569;border-bottom:1px solid #e5e7eb;width:180px">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;color:#111827;border-bottom:1px solid #e5e7eb;font-weight:600">${escapeHtml(value || "-")}</td>
    </tr>
  `;
}
export async function sendClubApplicationEmail(application) {
  const recipients = env.adminEmails;
  if (!recipients.length) {
    console.warn("[Email] Club application email skipped: ADMIN_EMAILS is not configured.");
    return { skipped: true };
  }

  const subject = `New Lekhok Tripura Club application - ${application.fullName}`;
  const htmlContent = `
    <div style="font-family:Inter,Arial,sans-serif;background:#f6f1e8;color:#102c22;padding:28px;border-radius:18px;max-width:760px">
      <p style="letter-spacing:0.24em;text-transform:uppercase;color:#174d38;font-size:12px;margin:0 0 10px">LEKHOK TRIPURA CLUB</p>
      <h1 style="font-size:28px;margin:0 0 8px;color:#174d38">New Club Application</h1>
      <p style="color:#334155;margin:0 0 24px">A reader/writer submitted the Join Our Club form.</p>
      <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
        ${lightDetailRow("Full Name", application.fullName)}
        ${lightDetailRow("Mail ID", application.email)}
        ${lightDetailRow("Phone Number", application.phone)}
        ${lightDetailRow("WhatsApp Number", application.whatsapp)}
        ${lightDetailRow("Date of Birth", application.dateOfBirth)}
        ${lightDetailRow("Address", application.address)}
        ${lightDetailRow("Reason", application.reason)}
      </table>
    </div>
  `;

  const textContent = [
    "New Lekhok Tripura Club application",
    `Full Name: ${application.fullName}`,
    `Mail ID: ${application.email}`,
    `Phone Number: ${application.phone}`,
    `WhatsApp Number: ${application.whatsapp}`,
    `Date of Birth: ${application.dateOfBirth}`,
    `Address: ${application.address}`,
    `Reason: ${application.reason}`
  ].join("\n");

  if (env.resendApiKey) {
    try {
      console.log("[Email] Sending club application to admins via Resend...");
      return await sendEmailViaResend({
        to: recipients,
        subject,
        html: htmlContent,
        text: textContent
      });
    } catch (error) {
      console.error("[Email] Failed to send club application via Resend:", error);
    }
  }

  const info = await getTransport().sendMail({
    from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
    to: recipients,
    subject,
    html: htmlContent,
    text: textContent
  });

  if (env.nodeEnv !== "production" && info.message) {
    console.log("Club application email preview (SMTP Fallback):", info.message.toString());
  }

  return info;
}

export async function sendEnquiryEmail(enquiry) {
  const recipients = env.adminEmails;
  if (!recipients.length) {
    console.warn("[Email] Enquiry email skipped: ADMIN_EMAILS is not configured.");
    return { skipped: true };
  }

  const subject = `New Lekhok Tripura general enquiry - ${enquiry.fullName}`;
  const htmlContent = `
    <div style="font-family:Inter,Arial,sans-serif;background:#f6f1e8;color:#102c22;padding:28px;border-radius:18px;max-width:760px">
      <p style="letter-spacing:0.24em;text-transform:uppercase;color:#174d38;font-size:12px;margin:0 0 10px">LEKHOK TRIPURA ENQUIRY</p>
      <h1 style="font-size:28px;margin:0 0 8px;color:#174d38">New General Enquiry</h1>
      <p style="color:#334155;margin:0 0 24px">A visitor submitted the homepage Enquiry form.</p>
      <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
        ${lightDetailRow("Full Name", enquiry.fullName)}
        ${lightDetailRow("Mail ID", enquiry.email)}
        ${lightDetailRow("Phone Number", enquiry.phone)}
        ${lightDetailRow("Message / Query", enquiry.message)}
      </table>
    </div>
  `;

  const textContent = [
    "New Lekhok Tripura general enquiry",
    `Full Name: ${enquiry.fullName}`,
    `Mail ID: ${enquiry.email}`,
    `Phone Number: ${enquiry.phone}`,
    `Message / Query: ${enquiry.message}`
  ].join("\n");

  if (env.resendApiKey) {
    try {
      console.log("[Email] Sending enquiry to admins via Resend...");
      return await sendEmailViaResend({
        to: recipients,
        subject,
        html: htmlContent,
        text: textContent
      });
    } catch (error) {
      console.error("[Email] Failed to send enquiry email via Resend:", error);
    }
  }

  const info = await getTransport().sendMail({
    from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
    to: recipients,
    subject,
    html: htmlContent,
    text: textContent
  });

  if (env.nodeEnv !== "production" && info.message) {
    console.log("Enquiry email preview (SMTP Fallback):", info.message.toString());
  }

  return info;
}




export async function sendFreePublishingEmail(application) {
  const recipients = env.adminEmails;
  if (!recipients.length) {
    console.warn("[Email] Free publishing email skipped: ADMIN_EMAILS is not configured.");
    return { skipped: true };
  }

  const manuscript = application.manuscript;
  const subject = `New free sponsored publishing request - ${application.name}`;
  const htmlContent = `
    <div style="font-family:Inter,Arial,sans-serif;background:#050505;color:#ffffff;padding:28px;border-radius:18px;max-width:760px">
      <p style="letter-spacing:0.24em;text-transform:uppercase;color:#67e8f9;font-size:12px;margin:0 0 10px">LEKHAK sponsored publishing</p>
      <h1 style="font-size:28px;margin:0 0 8px;color:#ffffff">New Free Sponsored Publishing Application</h1>
      <p style="color:#a1a1aa;margin:0 0 24px">A financially challenged writer submitted the sponsorship publishing form. Manuscript PDF is attached.</p>
      <table style="width:100%;border-collapse:collapse;background:#0d0d0d;border:1px solid #1f2937;border-radius:14px;overflow:hidden">
        ${detailRow("Name", application.name)}
        ${detailRow("Phone", application.phone)}
        ${detailRow("Email", application.email)}
        ${detailRow("Book is about", application.bookAbout)}
        ${detailRow("Manuscript Ready", application.manuscriptReady)}
        ${detailRow("Uploaded File", manuscript?.originalname)}
      </table>
    </div>
  `;

  const textContent = [
    "New free sponsored publishing application",
    `Name: ${application.name}`,
    `Phone: ${application.phone}`,
    `Email: ${application.email}`,
    `Book is about: ${application.bookAbout}`,
    `Manuscript Ready: ${application.manuscriptReady}`,
    `Uploaded File: ${manuscript?.originalname || "-"}`
  ].join("\n");

  const resendAttachments = manuscript?.path ? [{
    filename: manuscript.originalname || "manuscript.pdf",
    content: fs.readFileSync(manuscript.path).toString("base64")
  }] : [];

  const smtpAttachments = manuscript?.path ? [{
    filename: manuscript.originalname || "manuscript.pdf",
    path: manuscript.path,
    contentType: "application/pdf"
  }] : [];

  if (env.resendApiKey) {
    try {
      console.log("[Email] Sending free sponsored publishing application to admins via Resend...");
      return await sendEmailViaResend({
        to: recipients,
        subject,
        html: htmlContent,
        text: textContent,
        attachments: resendAttachments
      });
    } catch (error) {
      console.error("[Email] Failed to send free sponsored publishing application via Resend:", error);
    }
  }

  const info = await getTransport().sendMail({
    from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
    to: recipients,
    subject,
    html: htmlContent,
    text: textContent,
    attachments: smtpAttachments
  });

  if (env.nodeEnv !== "production" && info.message) {
    console.log("Free sponsored publishing email preview (SMTP Fallback):", info.message.toString());
  }

  return info;
}


export async function sendSelfPublishingPlanEmail(application) {
  const recipients = env.adminEmails;
  if (!recipients.length) {
    console.warn("[Email] Self publishing plan email skipped: ADMIN_EMAILS is not configured.");
    return { skipped: true };
  }

  const manuscript = application.manuscript;
  const subject = `New self publishing plan inquiry - ${application.planName}`;
  const htmlContent = `
    <div style="font-family:Inter,Arial,sans-serif;background:#050505;color:#ffffff;padding:28px;border-radius:18px;max-width:760px">
      <p style="letter-spacing:0.24em;text-transform:uppercase;color:#67e8f9;font-size:12px;margin:0 0 10px">LEKHAK self publishing</p>
      <h1 style="font-size:28px;margin:0 0 8px;color:#ffffff">New Self Publishing Plan Inquiry</h1>
      <p style="color:#a1a1aa;margin:0 0 24px">An author selected a paid self publishing plan.</p>
      <table style="width:100%;border-collapse:collapse;background:#0d0d0d;border:1px solid #1f2937;border-radius:14px;overflow:hidden">
        ${detailRow("Selected Plan", application.planName)}
        ${detailRow("Name", application.name)}
        ${detailRow("Phone", application.phone)}
        ${detailRow("Email", application.email)}
        ${detailRow("Book Title", application.bookTitle)}
        ${detailRow("Genre / Category", application.genre)}
        ${detailRow("Page Count (A5)", application.pageCount)}
        ${detailRow("Publishing Preference", application.publishingType)}
        ${detailRow("Nominee Details", application.nominee)}
        ${detailRow("Full Address", application.address)}
        ${detailRow("Book is about", application.bookAbout)}
        ${detailRow("Note", application.note)}
        ${detailRow("Selected Add-ons", Array.isArray(application.addons) ? application.addons.join(", ") : application.addons || "None")}
        ${detailRow("Uploaded Manuscript", manuscript?.originalname || "Not uploaded")}
      </table>
    </div>
  `;

  const textContent = [
    "New self publishing plan inquiry",
    `Selected Plan: ${application.planName}`,
    `Name: ${application.name}`,
    `Phone: ${application.phone}`,
    `Email: ${application.email}`,
    `Book Title: ${application.bookTitle || "-"}`,
    `Genre / Category: ${application.genre || "-"}`,
    `Page Count (A5): ${application.pageCount || "-"}`,
    `Publishing Preference: ${application.publishingType || "-"}`,
    `Nominee Details: ${application.nominee || "-"}`,
    `Full Address: ${application.address || "-"}`,
    `Book is about: ${application.bookAbout || "-"}`,
    `Note: ${application.note || "-"}`,
    `Selected Add-ons: ${Array.isArray(application.addons) ? application.addons.join(", ") : application.addons || "None"}`,
    `Uploaded Manuscript: ${manuscript?.originalname || "-"}`
  ].join("\n");

  const resendAttachments = manuscript?.path ? [{
    filename: manuscript.originalname || "manuscript",
    content: fs.readFileSync(manuscript.path).toString("base64")
  }] : [];

  const smtpAttachments = manuscript?.path ? [{
    filename: manuscript.originalname || "manuscript",
    path: manuscript.path
  }] : [];

  if (env.resendApiKey) {
    try {
      console.log("[Email] Sending self publishing plan inquiry to admins via Resend...");
      return await sendEmailViaResend({ to: recipients, subject, html: htmlContent, text: textContent, attachments: resendAttachments });
    } catch (error) {
      console.error("[Email] Failed to send self publishing plan inquiry via Resend:", error);
    }
  }

  const info = await getTransport().sendMail({
    from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
    to: recipients,
    subject,
    html: htmlContent,
    text: textContent,
    attachments: smtpAttachments
  });

  if (env.nodeEnv !== "production" && info.message) {
    console.log("Self publishing plan email preview (SMTP Fallback):", info.message.toString());
  }

  return info;
}

export async function sendSelfPublishingUserConfirmationEmail(application) {
  const recipient = application.email;
  if (!recipient) return { skipped: true };

  const planPrices = {
    basic: { base: 4999, gst: 899.82, total: 5898.82, name: "Basic Publishing Plan" },
    essential: { base: 7999, gst: 1439.82, total: 9438.82, name: "Essential Publishing Plan" },
    popular: { base: 11999, gst: 2159.82, total: 14158.82, name: "Popular Publishing Plan" },
  };

  const norm = String(application.planName || "").toLowerCase();
  const pricing = norm.includes("essential") ? planPrices.essential : (norm.includes("popular") ? planPrices.popular : planPrices.basic);

  const subject = `Registration Received - Self Publishing Plan (${application.bookTitle || 'Book Submission'}) - Lekhok Tripura`;

  const htmlContent = `
    <div style="font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#050505;color:#ffffff;padding:32px;border-radius:18px;max-width:720px;margin:0 auto;border:1px solid #1f2937">
      <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #38bdf8;margin-bottom:24px">
        <p style="letter-spacing:0.25em;text-transform:uppercase;color:#38bdf8;font-size:12px;font-weight:bold;margin:0 0 6px">LEKHOK TRIPURA PUBLISHERS</p>
        <h1 style="font-size:26px;color:#ffffff;margin:0;font-weight:800">Self Publishing Registration Received! 📚</h1>
      </div>

      <div style="background:#0d0d0d;padding:24px;border-radius:14px;border:1px solid #1e293b;margin-bottom:24px">
        <h2 style="font-size:18px;color:#38bdf8;margin:0 0 12px">Dear ${escapeHtml(application.name || application.authorName || 'Author')},</h2>
        <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0 0 16px">
          Thank you for registering your book <strong>"${escapeHtml(application.bookTitle || 'Your Book')}"</strong> with <strong>Lekhok Tripura Publishers</strong>!
        </p>
        <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0">
          Your payment of <strong>₹${pricing.total.toFixed(2)}</strong> (Base ₹${pricing.base.toFixed(2)} + 18% GST ₹${pricing.gst.toFixed(2)}) has been verified. Your <strong>BOOK SKU No.</strong> will be assigned and shared with you shortly after manuscript verification.
        </p>
      </div>

      <!-- Registration Summary Table -->
      <div style="background:#0d0d0d;padding:20px;border-radius:14px;border:1px solid #1e293b;margin-bottom:24px">
        <h3 style="font-size:14px;color:#ffffff;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 14px;border-bottom:1px solid #1e293b;padding-bottom:8px">Payment &amp; Registration Details</h3>
        <table style="width:100%;font-size:13px;color:#cbd5e1;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#94a3b8">Publishing Plan:</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#38bdf8">${escapeHtml(application.planName || pricing.name)}</td></tr>
          <tr><td style="padding:6px 0;color:#94a3b8">Plan Base Fee:</td><td style="padding:6px 0;text-align:right;color:#ffffff">₹${pricing.base.toFixed(2)}</td></tr>
          <tr><td style="padding:6px 0;color:#94a3b8">GST (18%):</td><td style="padding:6px 0;text-align:right;color:#ffffff">₹${pricing.gst.toFixed(2)}</td></tr>
          <tr style="border-top:1px solid #334155"><td style="padding:8px 0;font-weight:bold;color:#ffffff">Total Amount Paid:</td><td style="padding:8px 0;text-align:right;font-weight:bold;font-size:15px;color:#34d399">₹${pricing.total.toFixed(2)}</td></tr>
          ${application.paymentId ? `<tr><td style="padding:6px 0;color:#94a3b8">Transaction ID:</td><td style="padding:6px 0;text-align:right;font-family:monospace;color:#38bdf8">${escapeHtml(application.paymentId)}</td></tr>` : ''}
          ${application.bookTitle ? `<tr><td style="padding:6px 0;color:#94a3b8">Book Title:</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#ffffff">${escapeHtml(application.bookTitle)}</td></tr>` : ''}
          ${application.authorName ? `<tr><td style="padding:6px 0;color:#94a3b8">Author Name (Cover):</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#ffffff">${escapeHtml(application.authorName)}</td></tr>` : ''}
          ${application.language ? `<tr><td style="padding:6px 0;color:#94a3b8">Language:</td><td style="padding:6px 0;text-align:right;color:#38bdf8">${escapeHtml(application.language)}</td></tr>` : ''}
          ${application.genre ? `<tr><td style="padding:6px 0;color:#94a3b8">Book Genre:</td><td style="padding:6px 0;text-align:right;color:#ffffff">${escapeHtml(application.genre)}</td></tr>` : ''}
          ${application.totalPages ? `<tr><td style="padding:6px 0;color:#94a3b8">Total Number of Pages:</td><td style="padding:6px 0;text-align:right;color:#ffffff">${escapeHtml(application.totalPages)}</td></tr>` : ''}
          ${application.bookSize ? `<tr><td style="padding:6px 0;color:#94a3b8">Book Size:</td><td style="padding:6px 0;text-align:right;color:#ffffff">${escapeHtml(application.bookSize)}</td></tr>` : ''}
          ${application.paperType ? `<tr><td style="padding:6px 0;color:#94a3b8">Paper Type:</td><td style="padding:6px 0;text-align:right;color:#ffffff">${escapeHtml(application.paperType)}</td></tr>` : ''}
          ${application.printType ? `<tr><td style="padding:6px 0;color:#94a3b8">Print Type:</td><td style="padding:6px 0;text-align:right;color:#ffffff">${escapeHtml(application.printType)}</td></tr>` : ''}
          ${application.bookType ? `<tr><td style="padding:6px 0;color:#94a3b8">Book Type:</td><td style="padding:6px 0;text-align:right;color:#38bdf8;font-weight:bold">${escapeHtml(application.bookType)}</td></tr>` : ''}
          ${application.copies ? `<tr><td style="padding:6px 0;color:#94a3b8">Initial Copies Required:</td><td style="padding:6px 0;text-align:right;color:#34d399;font-weight:bold">${escapeHtml(application.copies)} Copies</td></tr>` : ''}
        </table>
      </div>

      <div style="background:#1e1b4b;padding:20px;border-radius:14px;border:1px solid #4338ca;margin-bottom:24px">
        <h3 style="font-size:14px;color:#a5b4fc;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">📌 What Happens Next?</h3>
        <ol style="margin:0;padding-left:20px;color:#e0e7ff;font-size:13px;line-height:1.8">
          <li>Our editorial desk will review your submission within 24–48 hours.</li>
          <li>Your unique <strong>BOOK SKU No.</strong> and dedicated publishing manager will be assigned.</li>
          <li>We will contact you via Phone / Email to guide you through manuscript formatting, cover design, and printing.</li>
        </ol>
      </div>

      <div style="border-top:1px solid #1f2937;padding-top:20px;text-align:center;font-size:12px;color:#64748b">
        <p>If you have any questions, reply to this email or reach us at support@lekhoktripura.in</p>
        <p style="margin-top:4px">© ${new Date().getFullYear()} Lekhok Tripura Publishers. Agartala, Tripura.</p>
      </div>
    </div>
  `;

  const textContent = `Self Publishing Registration Received for "${application.bookTitle}"!\nThank you ${application.name}. Total Paid: ₹${pricing.total.toFixed(2)}. Your BOOK SKU No. will be shared shortly after verification.`;

  if (env.resendApiKey) {
    await sendEmailViaResend({ to: [recipient], subject, html: htmlContent, text: textContent });
  } else {
    await getTransport().sendMail({
      from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
      to: recipient,
      subject,
      html: htmlContent,
      text: textContent,
    });
  }
}

export async function sendSubscriptionEmail(email) {
  const recipients = env.adminEmails;
  if (!recipients.length) {
    console.warn("[Email] Subscription email skipped: ADMIN_EMAILS is not configured.");
    return { skipped: true };
  }

  const subject = `New Free Stories Subscription - ${email}`;
  const htmlContent = `
    <div style="font-family:Inter,Arial,sans-serif;background:#f6f1e8;color:#102c22;padding:28px;border-radius:18px;max-width:760px">
      <p style="letter-spacing:0.24em;text-transform:uppercase;color:#174d38;font-size:12px;margin:0 0 10px">LEKHOK TRIPURA</p>
      <h1 style="font-size:28px;margin:0 0 8px;color:#174d38">New Free Stories Subscription</h1>
      <p style="color:#334155;margin:0 0 24px">A visitor has subscribed to receive free stories with the following email address:</p>
      <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
        ${lightDetailRow("Subscriber Email", email)}
      </table>
    </div>
  `;

  const textContent = `New Free Stories Subscription\nEmail: ${email}`;

  if (env.resendApiKey) {
    try {
      console.log("[Email] Sending free stories subscription to admins via Resend...");
      return await sendEmailViaResend({
        to: recipients,
        subject,
        html: htmlContent,
        text: textContent
      });
    } catch (error) {
      console.error("[Email] Failed to send subscription email via Resend:", error);
    }
  }

  const info = await getTransport().sendMail({
    from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
    to: recipients,
    subject,
    html: htmlContent,
    text: textContent
  });

  if (env.nodeEnv !== "production" && info.message) {
    console.log("Subscription email preview (SMTP Fallback):", info.message.toString());
  }

  return info;
}

export async function sendStoryAccessRequestEmail({ request, story }) {
  const recipients = env.adminEmails;
  if (!recipients.length) {
    console.warn("[Email] Story access request email skipped: ADMIN_EMAILS is not configured.");
    return { skipped: true };
  }

  const subject = `New Story Payment Request (₹${story.price}) - ${story.title}`;
  const htmlContent = `
    <div style="font-family:Inter,Arial,sans-serif;background:#050505;color:#ffffff;padding:28px;border-radius:18px;max-width:720px">
      <p style="letter-spacing:0.24em;text-transform:uppercase;color:#38bdf8;font-size:12px;margin:0 0 10px">LEKHOK TRIPURA PAID STORY</p>
      <h1 style="font-size:24px;margin:0 0 6px">New Story Payment Verification Request</h1>
      <p style="color:#a1a1aa;margin:0 0 24px">A reader submitted a payment transaction reference for story access.</p>

      <table style="width:100%;border-collapse:collapse;background:#0d0d0d;border:1px solid #1f2937;border-radius:14px;overflow:hidden">
        ${detailRow("Story Title", story.title)}
        ${detailRow("Amount", `₹${story.price}`)}
        ${detailRow("Reader Name", request.userName)}
        ${detailRow("Reader Email", request.userEmail)}
        ${detailRow("Reader Phone", request.userPhone)}
        ${detailRow("UPI Transaction ID / UTR", request.transactionId)}
        ${detailRow("Status", request.status)}
      </table>
    </div>
  `;

  const textContent = [
    `New Story Payment Verification Request`,
    `Story: ${story.title}`,
    `Amount: ₹${story.price}`,
    `Reader Name: ${request.userName}`,
    `Reader Email: ${request.userEmail}`,
    `Reader Phone: ${request.userPhone}`,
    `Transaction ID / UTR: ${request.transactionId}`
  ].join("\n");

  if (env.resendApiKey) {
    try {
      console.log(`[Email] Sending story access request to admins via Resend...`);
      return await sendEmailViaResend({
        to: recipients,
        subject,
        html: htmlContent,
        text: textContent
      });
    } catch (error) {
      console.error("[Email] Failed to send story access request email via Resend:", error);
    }
  }

  return await getTransport().sendMail({
    from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
    to: recipients,
    subject,
    html: htmlContent,
    text: textContent
  });
}

export async function sendStoryAccessApprovalEmail({ request, story }) {
  const recipient = request.userEmail;
  if (!recipient) return { skipped: true };

  const isApproved = request.status === "approved";
  const subject = isApproved
    ? `Access Approved for "${story.title}" - Lekhok Tripura`
    : `Access Request Update for "${story.title}" - Lekhok Tripura`;

  const htmlContent = `
    <div style="font-family:Inter,Arial,sans-serif;background:#050505;color:#ffffff;padding:28px;border-radius:18px;max-width:720px">
      <p style="letter-spacing:0.24em;text-transform:uppercase;color:${isApproved ? '#34d399' : '#f87171'};font-size:12px;margin:0 0 10px">LEKHOK TRIPURA</p>
      <h1 style="font-size:24px;margin:0 0 6px">${isApproved ? 'Story Access Granted!' : 'Story Access Update'}</h1>
      <p style="color:#a1a1aa;margin:0 0 24px">Hello ${escapeHtml(request.userName)},</p>
      <p style="color:#e2e8f0;line-height:1.6;margin:0 0 20px">
        ${isApproved 
          ? `Your payment of ₹${story.price} for the story <strong>"${escapeHtml(story.title)}"</strong> has been verified and approved!`
          : `Your access request for <strong>"${escapeHtml(story.title)}"</strong> has been updated to: <strong>${request.status}</strong>.`}
      </p>

      <table style="width:100%;border-collapse:collapse;background:#0d0d0d;border:1px solid #1f2937;border-radius:14px;overflow:hidden;margin-bottom:24px">
        ${detailRow("Story Title", story.title)}
        ${detailRow("Transaction ID / UTR", request.transactionId)}
        ${detailRow("Status", request.status)}
      </table>

      ${isApproved ? `
        <div style="text-align:center;margin-top:28px">
          <a href="${env.clientUrl}/short-stories/${story.slug}" style="background:#38bdf8;color:#000000;padding:14px 28px;border-radius:12px;font-weight:bold;text-decoration:none;display:inline-block">Read Story Now</a>
        </div>
      ` : ''}
    </div>
  `;

  const textContent = isApproved
    ? `Your story access for "${story.title}" has been approved! Read now: ${env.clientUrl}/short-stories/${story.slug}`
    : `Your story access request for "${story.title}" status: ${request.status}`;

  if (env.resendApiKey) {
    try {
      console.log(`[Email] Sending story access notification to reader (${recipient}) via Resend...`);
      return await sendEmailViaResend({
        to: [recipient],
        subject,
        html: htmlContent,
        text: textContent
      });
    } catch (error) {
      console.error("[Email] Failed to send story access notification email via Resend:", error);
    }
  }

  return await getTransport().sendMail({
    from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
    to: recipient,
    subject,
    html: htmlContent,
    text: textContent
  });
}

export async function sendPurchaseConfirmationEmail({ user, purchases, paymentId }) {
  const recipient = user?.email;
  if (!recipient) return { skipped: true };

  const totalPaid = purchases.reduce((acc, p) => acc + (p.amount || 0), 0);
  const subject = `Order Confirmation & Receipt - ₹${totalPaid} Paid - Lekhok Tripura`;

  const itemsHtml = purchases.map((p) => {
    const book = p.bookId || {};
    const formatUpper = (p.format || "ebook").toUpperCase();

    return `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #1f2937">
          <strong style="color:#ffffff;font-size:14px">${escapeHtml(book.title || "Book")}</strong><br/>
          <span style="color:#94a3b8;font-size:12px">Author: ${escapeHtml(book.author || "Lekhok Tripura")}</span>
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #1f2937;color:#38bdf8;font-weight:bold;font-size:12px">${formatUpper}</td>
        <td style="padding:14px 16px;border-bottom:1px solid #1f2937;color:#34d399;font-weight:bold;font-size:12px;text-align:right">₹${p.amount}</td>
      </tr>
    `;
  }).join("");

  const htmlContent = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#050505;color:#ffffff;padding:32px;border-radius:18px;max-width:680px;margin:0 auto;border:1px solid #1f2937">
      <div style="text-align:center;padding-bottom:24px;border-bottom:2px solid #06b6d4;margin-bottom:24px">
        <p style="letter-spacing:0.25em;text-transform:uppercase;color:#38bdf8;font-size:12px;font-weight:bold;margin:0 0 6px">LEKHOK TRIPURA</p>
        <h1 style="font-size:26px;color:#ffffff;margin:0;font-weight:800">Payment Successful!</h1>
        <p style="color:#94a3b8;font-size:13px;margin-top:6px">Thank you for your purchase. Your order has been confirmed.</p>
      </div>

      <p style="color:#e2e8f0;font-size:14px;line-height:1.6;margin-bottom:20px">
        Hello <strong>${escapeHtml(user.name || "Reader")}</strong>,
      </p>
      <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin-bottom:24px">
        We have successfully received your payment of <strong>₹${totalPaid}</strong> via Razorpay. Your digital eBooks have been unlocked instantly in your account.
      </p>

      <table style="width:100%;border-collapse:collapse;background:#0d0d0d;border:1px solid #1f2937;border-radius:14px;overflow:hidden;margin-bottom:24px">
        <thead>
          <tr style="background:#111827">
            <th style="padding:12px 16px;color:#94a3b8;font-size:11px;text-transform:uppercase;text-align:left">Item</th>
            <th style="padding:12px 16px;color:#94a3b8;font-size:11px;text-transform:uppercase;text-align:left">Format</th>
            <th style="padding:12px 16px;color:#94a3b8;font-size:11px;text-transform:uppercase;text-align:right">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="background:#0f172a;border:1px solid #1e293b;padding:16px;border-radius:12px;margin-bottom:28px">
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;color:#38bdf8;font-weight:bold">Payment Summary</p>
        <p style="margin:0 0 4px;font-size:13px;color:#e2e8f0">Transaction Payment ID: <code style="color:#34d399;font-family:monospace">${paymentId}</code></p>
        <p style="margin:0;font-size:13px;color:#e2e8f0">Total Amount Paid: <strong style="color:#34d399">₹${totalPaid}</strong></p>
      </div>

      <div style="text-align:center;margin-bottom:24px">
        <a href="${env.clientUrl}/library" style="background:linear-gradient(to right, #38bdf8, #818cf8);color:#000000;padding:14px 32px;border-radius:14px;font-weight:800;font-size:14px;text-decoration:none;display:inline-block;box-shadow:0 0 20px rgba(56,189,248,0.3)">
          Access My Purchased Books →
        </a>
      </div>

      <div style="border-top:1px solid #1f2937;padding-top:20px;text-align:center;font-size:12px;color:#64748b">
        <p>If you have any questions, reply to this email or contact support@lekhoktripura.in.</p>
        <p style="margin-top:4px">© ${new Date().getFullYear()} Lekhok Tripura. All rights reserved.</p>
      </div>
    </div>
  `;

  const textContent = [
    `LEKHOK TRIPURA - Payment Successful!`,
    `Hello ${user.name || "Reader"},`,
    `Thank you for your purchase. Payment of ₹${totalPaid} received. Transaction ID: ${paymentId}.`,
    `Access your books now at: ${env.clientUrl}/library`
  ].join("\n");

  if (env.resendApiKey) {
    try {
      console.log(`[Email] Sending purchase confirmation email to reader (${recipient}) via Resend...`);
      return await sendEmailViaResend({
        to: [recipient],
        subject,
        html: htmlContent,
        text: textContent
      });
    } catch (error) {
      console.error("[Email] Failed to send purchase confirmation email via Resend:", error);
    }
  }

  return await getTransport().sendMail({
    from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
    to: recipient,
    subject,
    html: htmlContent,
    text: textContent
  });
}

export async function sendWelcomeSubscriberEmail(email) {
  const subject = "Welcome to Lekhok Tripura Newsletter! 📚";
  const htmlContent = `
    <div style="font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#050505;color:#ffffff;padding:32px;border-radius:18px;max-width:640px;margin:0 auto;border:1px solid #1f2937">
      <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #06b6d4;margin-bottom:24px">
        <p style="letter-spacing:0.25em;text-transform:uppercase;color:#38bdf8;font-size:12px;font-weight:bold;margin:0 0 6px">LEKHOK TRIPURA</p>
        <h1 style="font-size:26px;color:#ffffff;margin:0;font-weight:800">Subscription Confirmed! 🎉</h1>
      </div>

      <p style="color:#e2e8f0;font-size:14px;line-height:1.6;margin-bottom:16px">
        Hello &amp; Welcome!
      </p>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin-bottom:24px">
        Thank you for subscribing to <strong>Lekhok Tripura Publishers</strong>! You are now subscribed to our reader notifications. Whenever a new book or short story is published on our platform, you will receive an instant email update.
      </p>

      <div style="text-align:center;margin:28px 0">
        <a href="${env.clientUrl}" style="background:linear-gradient(to right, #38bdf8, #818cf8);color:#000000;padding:14px 32px;border-radius:14px;font-weight:800;font-size:14px;text-decoration:none;display:inline-block">
          Explore Books &amp; Stories →
        </a>
      </div>

      <div style="border-top:1px solid #1f2937;padding-top:20px;text-align:center;font-size:12px;color:#64748b">
        <p>© ${new Date().getFullYear()} Lekhok Tripura Publishers. All rights reserved.</p>
      </div>
    </div>
  `;
  const textContent = `Welcome to Lekhok Tripura! You will receive an email whenever a new book or story is published. Visit: ${env.clientUrl}`;

  if (env.resendApiKey) {
    try {
      return await sendEmailViaResend({ to: [email], subject, html: htmlContent, text: textContent });
    } catch (e) {
      console.error("[Email] Resend error for welcome email:", e);
    }
  }

  return await getTransport().sendMail({
    from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
    to: email,
    subject,
    html: htmlContent,
    text: textContent
  });
}

export async function sendNewBookNotificationToSubscribers(book) {
  try {
    const subscribers = await Subscriber.find({ isActive: true }).select("email");
    if (!subscribers.length) {
      console.log("[Email] No active subscribers found for new book notification.");
      return { count: 0 };
    }

    const emails = subscribers.map((s) => s.email).filter(Boolean);
    const subject = `📖 New Book Released: "${book.title}" by ${book.author || "Lekhok Tripura"}`;
    
    const coverUrl = book.cover?.url
      ? (book.cover.url.startsWith("http") ? book.cover.url : `${env.clientUrl}${book.cover.url}`)
      : `${env.clientUrl}/book-placeholder.jpg`;

    const htmlContent = `
      <div style="font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#050505;color:#ffffff;padding:32px;border-radius:18px;max-width:680px;margin:0 auto;border:1px solid #1f2937">
        <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #06b6d4;margin-bottom:24px">
          <p style="letter-spacing:0.25em;text-transform:uppercase;color:#38bdf8;font-size:12px;font-weight:bold;margin:0 0 6px">LEKHOK TRIPURA PUBLICATION</p>
          <h1 style="font-size:26px;color:#ffffff;margin:0;font-weight:800">New Book Published! 📚</h1>
        </div>

        <div style="text-align:center;margin-bottom:24px">
          <img src="${coverUrl}" alt="${escapeHtml(book.title || '')}" style="max-width:220px;height:auto;border-radius:12px;border:1px solid #334155;box-shadow:0 10px 30px rgba(0,0,0,0.5)" />
        </div>

        <div style="text-align:center;margin-bottom:20px">
          <h2 style="font-size:22px;color:#ffffff;margin:0 0 6px">${escapeHtml(book.title || '')}</h2>
          <p style="color:#38bdf8;font-weight:bold;margin:0">By ${escapeHtml(book.author || "Lekhok Tripura")}</p>
          ${book.category ? `<span style="display:inline-block;background:#1e293b;color:#94a3b8;padding:4px 12px;border-radius:20px;font-size:11px;text-transform:uppercase;margin-top:8px;font-weight:bold">${escapeHtml(book.category)}</span>` : ''}
        </div>

        <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin-bottom:24px;background:#0d0d0d;padding:16px;border-radius:12px;border:1px solid #1e293b">
          ${escapeHtml(book.description || "A brand new book is now live on Lekhok Tripura!")}
        </p>

        <div style="text-align:center;margin:32px 0">
          <a href="${env.clientUrl}/library" style="background:linear-gradient(to right, #38bdf8, #818cf8);color:#000000;padding:16px 36px;border-radius:14px;font-weight:800;font-size:15px;text-decoration:none;display:inline-block;box-shadow:0 0 20px rgba(56,189,248,0.3)">
            View &amp; Buy Book Now →
          </a>
        </div>

        <div style="border-top:1px solid #1f2937;padding-top:20px;text-align:center;font-size:12px;color:#64748b">
          <p>You received this email because you subscribed to Lekhok Tripura book updates.</p>
          <p style="margin-top:4px">© ${new Date().getFullYear()} Lekhok Tripura Publishers. All rights reserved.</p>
        </div>
      </div>
    `;

    const textContent = `New Book Published: "${book.title}" by ${book.author}.\nCheck it out now at: ${env.clientUrl}/library`;

    console.log(`[Email] Sending new book notification to ${emails.length} subscribers...`);
    for (const email of emails) {
      try {
        if (env.resendApiKey) {
          await sendEmailViaResend({ to: [email], subject, html: htmlContent, text: textContent });
        } else {
          await getTransport().sendMail({
            from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
            to: email,
            subject,
            html: htmlContent,
            text: textContent
          });
        }
      } catch (err) {
        console.error(`[Email] Failed to send new book email to ${email}:`, err);
      }
    }
    return { count: emails.length };
  } catch (error) {
    console.error("[Email] Failed to send new book notification:", error);
  }
}

export async function sendNewStoryNotificationToSubscribers(story) {
  try {
    const subscribers = await Subscriber.find({ isActive: true }).select("email");
    if (!subscribers.length) {
      console.log("[Email] No active subscribers found for new story notification.");
      return { count: 0 };
    }

    const emails = subscribers.map((s) => s.email).filter(Boolean);
    const subject = `✍️ New Story Published: "${story.title}"`;

    const coverUrl = story.cover?.url
      ? (story.cover.url.startsWith("http") ? story.cover.url : `${env.clientUrl}${story.cover.url}`)
      : `${env.clientUrl}/book-placeholder.jpg`;

    const storyUrl = `${env.clientUrl}/short-stories/${story.slug}`;

    const htmlContent = `
      <div style="font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#050505;color:#ffffff;padding:32px;border-radius:18px;max-width:680px;margin:0 auto;border:1px solid #1f2937">
        <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #38bdf8;margin-bottom:24px">
          <p style="letter-spacing:0.25em;text-transform:uppercase;color:#38bdf8;font-size:12px;font-weight:bold;margin:0 0 6px">LEKHOK TRIPURA STORIES</p>
          <h1 style="font-size:26px;color:#ffffff;margin:0;font-weight:800">New Story Published! ✍️</h1>
        </div>

        <div style="text-align:center;margin-bottom:24px">
          <img src="${coverUrl}" alt="${escapeHtml(story.title || '')}" style="max-width:320px;width:100%;height:auto;border-radius:14px;border:1px solid #334155" />
        </div>

        <div style="text-align:center;margin-bottom:20px">
          <h2 style="font-size:24px;color:#ffffff;margin:0 0 6px">${escapeHtml(story.title || '')}</h2>
          <p style="color:#38bdf8;font-weight:bold;margin:0">Written by ${escapeHtml(story.author || "Lekhok Tripura")}</p>
          ${story.readingTime ? `<span style="display:inline-block;background:#1e293b;color:#34d399;padding:4px 12px;border-radius:20px;font-size:11px;text-transform:uppercase;margin-top:8px;font-weight:bold">⏱ ${story.readingTime} min read</span>` : ''}
        </div>

        <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin-bottom:24px;background:#0d0d0d;padding:16px;border-radius:12px;border:1px solid #1e293b">
          ${escapeHtml(story.description || "A fresh short story is now available to read on Lekhok Tripura!")}
        </p>

        <div style="text-align:center;margin:32px 0">
          <a href="${storyUrl}" style="background:linear-gradient(to right, #38bdf8, #818cf8);color:#000000;padding:16px 36px;border-radius:14px;font-weight:800;font-size:15px;text-decoration:none;display:inline-block;box-shadow:0 0 20px rgba(56,189,248,0.3)">
            Read Story Now →
          </a>
        </div>

        <div style="border-top:1px solid #1f2937;padding-top:20px;text-align:center;font-size:12px;color:#64748b">
          <p>You received this email because you subscribed to Lekhok Tripura story updates.</p>
          <p style="margin-top:4px">© ${new Date().getFullYear()} Lekhok Tripura Publishers. All rights reserved.</p>
        </div>
      </div>
    `;

    const textContent = `New Story Published: "${story.title}" by ${story.author}.\nRead it now at: ${storyUrl}`;

    console.log(`[Email] Sending new story notification to ${emails.length} subscribers...`);
    for (const email of emails) {
      try {
        if (env.resendApiKey) {
          await sendEmailViaResend({ to: [email], subject, html: htmlContent, text: textContent });
        } else {
          await getTransport().sendMail({
            from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
            to: email,
            subject,
            html: htmlContent,
            text: textContent
          });
        }
      } catch (err) {
        console.error(`[Email] Failed to send new story email to ${email}:`, err);
      }
    }
    return { count: emails.length };
  } catch (error) {
    console.error("[Email] Failed to send new story notification:", error);
  }
}

export async function sendClubMemberConfirmationEmail({ fullName, email, phone, role, memberId, amountPaid, paymentId, date }) {
  try {
    const memberIdDisplay = memberId || "LTCLUB-XXXX";
    const subject = `Welcome to Lekhok Tripura Club! Your Member ID: ${memberIdDisplay}`;
    const formattedAmount = Number(amountPaid || 1178.82).toFixed(2);
    const dateStr = date || new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    const htmlContent = `
      <div style="font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#050505;color:#ffffff;padding:32px;border-radius:18px;max-width:680px;margin:0 auto;border:1px solid #1f2937">
        <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #38bdf8;margin-bottom:24px">
          <p style="letter-spacing:0.25em;text-transform:uppercase;color:#38bdf8;font-size:12px;font-weight:bold;margin:0 0 6px">LEKHOK TRIPURA PUBLISHERS</p>
          <h1 style="font-size:26px;color:#ffffff;margin:0;font-weight:800">Welcome to Our Club! 🎉</h1>
          <p style="color:#94a3b8;font-size:13px;margin-top:8px">Your lifetime membership is now active.</p>
        </div>

        <div style="background:#0d0d0d;padding:24px;border-radius:14px;border:1px solid #1e293b;margin-bottom:24px">
          <h2 style="font-size:18px;color:#38bdf8;margin:0 0 12px">Dear ${escapeHtml(fullName)},</h2>
          <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0">
            Thank you for joining the <strong>Lekhok Tripura Readers &amp; Writers Club</strong>! Your payment of <strong>&#8377;${formattedAmount}</strong> (Base &#8377;999 + 18% GST &#8377;179.82) has been confirmed.
          </p>
        </div>

        <!-- MEMBER ID HIGHLIGHT -->
        <div style="background:linear-gradient(135deg,#0c2a3a,#0d1b2e);padding:28px 24px;border-radius:16px;border:2px solid #38bdf8;margin-bottom:24px;text-align:center">
          <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#38bdf8;margin:0 0 10px;font-weight:700">YOUR EXCLUSIVE MEMBER ID</p>
          <div style="font-family:monospace;font-size:36px;font-weight:900;letter-spacing:0.12em;color:#ffffff;background:#0a1929;display:inline-block;padding:14px 28px;border-radius:12px;border:1px solid #38bdf8;margin-bottom:14px">${escapeHtml(memberIdDisplay)}</div>
          <p style="font-size:12px;color:#94a3b8;margin:8px 0 0">Copy this ID — you need it to activate your member discounts from your Profile.</p>
        </div>

        <!-- HOW TO ACTIVATE -->
        <div style="background:#0f1f0f;padding:22px 24px;border-radius:14px;border:1px solid #16a34a;margin-bottom:24px">
          <h3 style="font-size:14px;color:#4ade80;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 14px">&#127919; How to Activate Your Member Discounts</h3>
          <ol style="margin:0;padding-left:20px;color:#bbf7d0;font-size:13px;line-height:2.2">
            <li>Log in to your account at <a href="${env.clientUrl}" style="color:#38bdf8;text-decoration:none">${env.clientUrl}</a></li>
            <li>Click the <strong>Profile icon</strong> (top-right corner of the navbar)</li>
            <li>Select <strong>&ldquo;Edit Profile&rdquo;</strong> from the dropdown menu</li>
            <li>Scroll down to the <strong>&ldquo;Activate Club Membership&rdquo;</strong> section</li>
            <li>Paste your Member ID: <span style="font-family:monospace;color:#38bdf8;background:#0a1929;padding:2px 8px;border-radius:4px">${escapeHtml(memberIdDisplay)}</span></li>
            <li>Click <strong>&ldquo;Activate Membership&rdquo;</strong> &mdash; discounts unlock instantly!</li>
          </ol>
        </div>

        <!-- DISCOUNT TABLE -->
        <div style="background:#1e1b4b;padding:20px;border-radius:14px;border:1px solid #4338ca;margin-bottom:24px">
          <h3 style="font-size:14px;color:#a5b4fc;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 14px">&#127873; Your Club Member Discounts</h3>
          <table style="width:100%;border-collapse:separate;border-spacing:0 6px">
            <tr>
              <td style="padding:10px 14px;background:#0d0b2e;border-radius:8px 0 0 8px;font-size:14px;color:#e0e7ff">&#128218; Any Book Purchase</td>
              <td style="padding:10px 16px;background:#0d0b2e;border-radius:0 8px 8px 0;font-size:20px;font-weight:900;color:#34d399;text-align:right">5% OFF</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#0d0b2e;border-radius:8px 0 0 8px;font-size:14px;color:#e0e7ff">&#9997;&#65039; Next Book Publishing</td>
              <td style="padding:10px 16px;background:#0d0b2e;border-radius:0 8px 8px 0;font-size:20px;font-weight:900;color:#a5b4fc;text-align:right">10% OFF</td>
            </tr>
          </table>
          <p style="margin:14px 0 0;font-size:12px;color:#6366f1">Plus: 20 visiting cards, official badge, membership card &amp; priority publishing support.</p>
        </div>

        <!-- PAYMENT RECEIPT -->
        <div style="background:#0d0d0d;padding:20px;border-radius:14px;border:1px solid #1e293b;margin-bottom:24px">
          <h3 style="font-size:15px;color:#ffffff;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 14px;border-bottom:1px solid #1e293b;padding-bottom:8px">Membership Payment Receipt</h3>
          <table style="width:100%;font-size:13px;color:#cbd5e1;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#94a3b8">Member Name:</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#ffffff">${escapeHtml(fullName)}</td></tr>
            <tr><td style="padding:6px 0;color:#94a3b8">Email Address:</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#ffffff">${escapeHtml(email)}</td></tr>
            <tr><td style="padding:6px 0;color:#94a3b8">Phone Number:</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#ffffff">${escapeHtml(phone)}</td></tr>
            <tr><td style="padding:6px 0;color:#94a3b8">Member ID:</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-weight:900;color:#38bdf8;font-size:16px">${escapeHtml(memberIdDisplay)}</td></tr>
            <tr><td style="padding:6px 0;color:#94a3b8">Membership Tier:</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#38bdf8">${escapeHtml(role || "Member")} (Lifetime)</td></tr>
            <tr><td style="padding:6px 0;color:#94a3b8">Base Fee:</td><td style="padding:6px 0;text-align:right;color:#ffffff">&#8377;999.00</td></tr>
            <tr><td style="padding:6px 0;color:#94a3b8">GST (18%):</td><td style="padding:6px 0;text-align:right;color:#ffffff">&#8377;179.82</td></tr>
            <tr style="border-top:1px solid #334155"><td style="padding:10px 0;font-weight:bold;color:#ffffff">Total Paid:</td><td style="padding:10px 0;text-align:right;font-weight:bold;font-size:16px;color:#34d399">&#8377;${formattedAmount}</td></tr>
            ${paymentId ? `<tr><td style="padding:6px 0;color:#94a3b8">Transaction ID:</td><td style="padding:6px 0;text-align:right;font-family:monospace;color:#38bdf8">${escapeHtml(paymentId)}</td></tr>` : ''}
            <tr><td style="padding:6px 0;color:#94a3b8">Date:</td><td style="padding:6px 0;text-align:right;color:#ffffff">${dateStr}</td></tr>
          </table>
        </div>

        <div style="text-align:center;margin:32px 0">
          <a href="${env.clientUrl}/club" style="background:linear-gradient(to right,#38bdf8,#818cf8);color:#000000;padding:14px 32px;border-radius:14px;font-weight:800;font-size:14px;text-decoration:none;display:inline-block">View Club Page &#8594;</a>
        </div>

        <div style="border-top:1px solid #1f2937;padding-top:20px;text-align:center;font-size:12px;color:#64748b">
          <p>&#128274; Keep this email safe &mdash; your Member ID <strong style="color:#38bdf8">${escapeHtml(memberIdDisplay)}</strong> is needed to activate benefits.</p>
          <p style="margin-top:6px">For queries, contact support@lekhoktripura.in</p>
          <p style="margin-top:4px">&copy; ${new Date().getFullYear()} Lekhok Tripura Publishers. Agartala, Tripura.</p>
        </div>
      </div>
    `;

    const textContent = `Welcome to Lekhok Tripura Club, ${fullName}!\n\nYour Member ID: ${memberIdDisplay}\n\n-- HOW TO ACTIVATE YOUR DISCOUNTS --\n1. Log in at ${env.clientUrl}\n2. Click your Profile icon (top-right corner)\n3. Select "Edit Profile"\n4. Scroll to "Activate Club Membership"\n5. Paste your Member ID: ${memberIdDisplay}\n6. Click "Activate Membership" — done!\n\nMember Discounts:\n- 5% OFF on any book purchase\n- 10% OFF on next book publishing\n\nPayment: Rs.${formattedAmount} confirmed.\nTxn ID: ${paymentId || "CONFIRMED"}\n\nKeep this email — your Member ID is needed to unlock discounts.`;

    if (env.resendApiKey) {
      await sendEmailViaResend({ to: [email], subject, html: htmlContent, text: textContent });
    } else {
      await getTransport().sendMail({
        from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
        to: email,
        subject,
        html: htmlContent,
        text: textContent,
      });
    }
    console.log(`[Email] Club member confirmation sent to ${email}`);
  } catch (error) {
    console.error("[Email] Failed to send club member confirmation email:", error);
  }
}

export async function sendRefundConfirmationEmail({ user, itemTitle, amount, paymentId, refundId, reason }) {
  const recipient = user?.email;
  if (!recipient) return { skipped: true };

  const subject = `Refund Processed - ₹${amount} - Lekhok Tripura`;
  const htmlContent = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#050505;color:#ffffff;padding:32px;border-radius:18px;max-width:680px;margin:0 auto;border:1px solid #1f2937">
      <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #f59e0b;margin-bottom:24px">
        <p style="letter-spacing:0.25em;text-transform:uppercase;color:#f59e0b;font-size:12px;font-weight:bold;margin:0 0 6px">LEKHOK TRIPURA</p>
        <h1 style="font-size:26px;color:#ffffff;margin:0;font-weight:800">Refund Processed 💸</h1>
        <p style="color:#94a3b8;font-size:13px;margin-top:6px">Your refund of ₹${amount} has been initiated.</p>
      </div>

      <p style="color:#e2e8f0;font-size:14px;line-height:1.6;margin-bottom:20px">
        Hello <strong>${escapeHtml(user.name || "Customer")}</strong>,
      </p>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin-bottom:24px">
        A refund of <strong>₹${amount}</strong> for <strong>"${escapeHtml(itemTitle)}"</strong> has been processed back to your original payment method.
      </p>

      <div style="background:#0d0d0d;padding:20px;border-radius:14px;border:1px solid #1e293b;margin-bottom:24px">
        <h3 style="font-size:14px;color:#ffffff;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 14px;border-bottom:1px solid #1e293b;padding-bottom:8px">Refund Receipt Details</h3>
        <table style="width:100%;font-size:13px;color:#cbd5e1;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#94a3b8">Item / Service:</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#ffffff">${escapeHtml(itemTitle)}</td></tr>
          <tr><td style="padding:6px 0;color:#94a3b8">Refund Amount:</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#34d399;font-size:15px">₹${amount}</td></tr>
          <tr><td style="padding:6px 0;color:#94a3b8">Original Txn ID:</td><td style="padding:6px 0;text-align:right;font-family:monospace;color:#38bdf8">${escapeHtml(paymentId || 'N/A')}</td></tr>
          ${refundId ? `<tr><td style="padding:6px 0;color:#94a3b8">Refund Reference ID:</td><td style="padding:6px 0;text-align:right;font-family:monospace;color:#f59e0b">${escapeHtml(refundId)}</td></tr>` : ''}
          ${reason ? `<tr><td style="padding:6px 0;color:#94a3b8">Reason / Note:</td><td style="padding:6px 0;text-align:right;color:#cbd5e1">${escapeHtml(reason)}</td></tr>` : ''}
        </table>
      </div>

      <div style="background:#1e1b4b;padding:16px;border-radius:12px;border:1px solid #4338ca;margin-bottom:24px">
        <p style="margin:0;font-size:13px;color:#e0e7ff;line-height:1.6">
          <strong>Note:</strong> Depending on your bank or card issuer, funds usually reflect in your bank account or UPI within 3–7 business days.
        </p>
      </div>

      <div style="border-top:1px solid #1f2937;padding-top:20px;text-align:center;font-size:12px;color:#64748b">
        <p>If you have any questions, contact us at support@lekhoktripura.in</p>
        <p style="margin-top:4px">© ${new Date().getFullYear()} Lekhok Tripura Publishers. Agartala, Tripura.</p>
      </div>
    </div>
  `;

  const textContent = `Refund Processed for "${itemTitle}"!\nAmount: ₹${amount}\nOriginal Txn: ${paymentId || 'N/A'}\nRefund Ref: ${refundId || "PROCESSED"}`;

  if (env.resendApiKey) {
    await sendEmailViaResend({ to: [recipient], subject, html: htmlContent, text: textContent });
  } else {
    await getTransport().sendMail({
      from: env.smtp.from || "Lekhok Tripura <no-reply@lekhoktripura.in>",
      to: recipient,
      subject,
      html: htmlContent,
      text: textContent
    });
  }
}



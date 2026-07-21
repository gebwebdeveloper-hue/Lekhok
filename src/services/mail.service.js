import nodemailer from "nodemailer";
import https from "https";
import fs from "fs";
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
    from: env.smtp.from || "Lekhok Tripura <onboarding@resend.dev>",
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
    from: env.smtp.from || "LEKHAK <no-reply@lekhoktripura.in>",
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
    from: env.smtp.from || "LEKHAK <no-reply@lekhoktripura.in>",
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
    from: env.smtp.from || "LEKHAK <no-reply@lekhoktripura.in>",
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
    from: env.smtp.from || "LEKHAK <no-reply@lekhoktripura.in>",
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
    from: env.smtp.from || "LEKHAK <no-reply@lekhoktripura.in>",
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


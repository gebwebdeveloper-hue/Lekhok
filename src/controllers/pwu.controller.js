import { PwuResponse } from "../models/PwuResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { env } from "../config/env.js";
import { sendEmailViaResend } from "../services/mail.service.js";

// 1. Submit PWU Quotation Form Response (Public)
export const submitPwuResponse = asyncHandler(async (req, res) => {
  const {
    authorName,
    authorNumber,
    authorEmail,
    authorAddress,
    bookName,
    bookLanguage,
    bookPageCount,
    copiesNeeded,
    selectedAddons,
    planType,
    notes,
  } = req.body;

  if (!authorName?.trim()) {
    throw new ApiError(400, "Author Name is required.");
  }
  if (!authorNumber?.trim()) {
    throw new ApiError(400, "Author Contact Number is required.");
  }
  if (!authorEmail?.trim() || !/^\S+@\S+\.\S+$/.test(authorEmail)) {
    throw new ApiError(400, "A valid Author Email ID is required.");
  }
  if (!authorAddress?.trim()) {
    throw new ApiError(400, "Author Address is required.");
  }
  if (!bookName?.trim()) {
    throw new ApiError(400, "Book Name is required.");
  }
  if (!bookLanguage?.trim()) {
    throw new ApiError(400, "Book Language is required.");
  }
  const cleanPages = parseInt(String(bookPageCount).replace(/\D/g, ""), 10);
  if (isNaN(cleanPages) || cleanPages <= 0) {
    throw new ApiError(400, "Book Page Count (A5) must be a valid positive integer value.");
  }

  const cleanCopies = parseInt(String(copiesNeeded).replace(/\D/g, ""), 10);
  if (isNaN(cleanCopies) || cleanCopies <= 0) {
    throw new ApiError(400, "Number of copies to be printed must be a valid positive integer value.");
  }

  const responseDoc = await PwuResponse.create({
    authorName: authorName.trim(),
    authorNumber: authorNumber.trim(),
    authorEmail: authorEmail.trim().toLowerCase(),
    authorAddress: authorAddress.trim(),
    bookName: bookName.trim(),
    bookLanguage: bookLanguage.trim(),
    bookPageCount: String(cleanPages),
    copiesNeeded: String(cleanCopies),
    selectedAddons: Array.isArray(selectedAddons) ? selectedAddons : [],
    planType: planType || "Basic Plan",
    notes: notes || "",
    status: "Pending",
  });

  // Attempt async email notifications (non-blocking)
  try {
    const adminEmails = env.adminEmails || ["lekhok.tripura@gmail.com"];
    const addonsList = responseDoc.selectedAddons.length > 0
      ? responseDoc.selectedAddons.join(", ")
      : "None selected";

    const adminEmailHtml = `
      <div style="font-family:Arial,sans-serif;background:#0b0f17;color:#ffffff;padding:28px;border-radius:14px;max-width:640px;">
        <h2 style="color:#34d399;margin-top:0;">📚 New Publish With Us (PWU) Quotation Request</h2>
        <p style="color:#94a3b8;font-size:14px;">An author has submitted their book details for a publishing quotation on Lekhok Tripura.</p>
        
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;color:#e2e8f0;">
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;width:40%;">AUTHOR NAME</td>
            <td style="padding:10px 0;">${responseDoc.authorName}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">AUTHOR NUMBER</td>
            <td style="padding:10px 0;">${responseDoc.authorNumber}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">AUTHOR MAIL ID</td>
            <td style="padding:10px 0;">${responseDoc.authorEmail}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">AUTHOR ADDRESS</td>
            <td style="padding:10px 0;">${responseDoc.authorAddress}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">BOOK NAME</td>
            <td style="padding:10px 0;">${responseDoc.bookName}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">BOOK LANGUAGE</td>
            <td style="padding:10px 0;">${responseDoc.bookLanguage}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">PAGE COUNT (A5)</td>
            <td style="padding:10px 0;">${responseDoc.bookPageCount}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">COPIES TO PRINT</td>
            <td style="padding:10px 0;">${responseDoc.copiesNeeded}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">ADD ONS REQUESTED</td>
            <td style="padding:10px 0;">${addonsList}</td>
          </tr>
        </table>
        
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">View this response anytime in the Admin Dashboard under <strong>PWU Form Response</strong>.</p>
      </div>
    `;

    if (env.resendApiKey) {
      await sendEmailViaResend({
        to: adminEmails,
        subject: `[PWU Inquiry] ${responseDoc.authorName} - "${responseDoc.bookName}"`,
        html: adminEmailHtml,
        text: `New PWU inquiry from ${responseDoc.authorName} (${responseDoc.authorNumber}) for book "${responseDoc.bookName}".`
      }).catch((e) => console.error("[PWU Email] Admin alert error:", e.message));

      const authorEmailHtml = `
        <div style="font-family:Arial,sans-serif;background:#0b0f17;color:#ffffff;padding:28px;border-radius:14px;max-width:600px;">
          <h2 style="color:#34d399;margin-top:0;">Lekhok Tripura Publishers</h2>
          <p>Dear <strong>${responseDoc.authorName}</strong>,</p>
          <p>Thank you for reaching out to us regarding publishing your book <em>"${responseDoc.bookName}"</em>.</p>
          <p>We have successfully received your details. Our publishing team is preparing a customized quotation based on your page count (${responseDoc.bookPageCount} A5 pages) and ${responseDoc.copiesNeeded} copies.</p>
          <p>We will contact you shortly on <strong>${responseDoc.authorNumber}</strong> / <strong>${responseDoc.authorEmail}</strong>.</p>
          <br/>
          <p style="color:#94a3b8;font-size:13px;">Warm Regards,<br/><strong style="color:#ffffff;">Lekhok Tripura Publishing Team</strong><br/>Tripura, India</p>
        </div>
      `;

      await sendEmailViaResend({
        to: [responseDoc.authorEmail],
        subject: `We have received your publishing quotation inquiry — Lekhok Tripura`,
        html: authorEmailHtml,
        text: `Dear ${responseDoc.authorName}, thank you for your publishing inquiry for "${responseDoc.bookName}". We will contact you shortly.`
      }).catch((e) => console.error("[PWU Email] Author confirm error:", e.message));
    }
  } catch (mailErr) {
    console.warn("[PWU Email] Notification warning:", mailErr.message);
  }

  res.status(201).json({
    success: true,
    message: "Thank you! Your publishing quotation request has been submitted. Our team will contact you shortly.",
    response: responseDoc,
  });
});

// 2. Get All PWU Responses (Admin protected)
export const getAllPwuResponses = asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 50 } = req.query;

  const query = {};

  if (status && status !== "all" && status !== "All") {
    query.status = status;
  }

  if (search && search.trim()) {
    const q = search.trim();
    const regex = new RegExp(q, "i");
    query.$or = [
      { authorName: regex },
      { authorNumber: regex },
      { authorEmail: regex },
      { bookName: regex },
      { bookLanguage: regex },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 50);
  const skip = (pageNum - 1) * limitNum;

  const [responses, total, pendingCount, contactedCount, quotationSentCount, completedCount] =
    await Promise.all([
      PwuResponse.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      PwuResponse.countDocuments(query),
      PwuResponse.countDocuments({ status: "Pending" }),
      PwuResponse.countDocuments({ status: "Contacted" }),
      PwuResponse.countDocuments({ status: "Quotation Sent" }),
      PwuResponse.countDocuments({ status: "Completed" }),
    ]);

  res.json({
    success: true,
    responses,
    stats: {
      total: await PwuResponse.countDocuments({}),
      pending: pendingCount,
      contacted: contactedCount,
      quotationSent: quotationSentCount,
      completed: completedCount,
    },
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

// 3. Update Status or Admin Notes (Admin protected)
export const updatePwuResponse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, adminNotes } = req.body;

  const updateFields = {};
  if (status) updateFields.status = status;
  if (adminNotes !== undefined) updateFields.adminNotes = adminNotes;

  const updated = await PwuResponse.findByIdAndUpdate(id, updateFields, {
    new: true,
    runValidators: true,
  });

  if (!updated) {
    throw new ApiError(404, "Quotation response record not found.");
  }

  res.json({
    success: true,
    message: "Record updated successfully.",
    response: updated,
  });
});

// 4. Delete PWU Response (Admin protected)
export const deletePwuResponse = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deleted = await PwuResponse.findByIdAndDelete(id);
  if (!deleted) {
    throw new ApiError(404, "Quotation response record not found.");
  }

  res.json({
    success: true,
    message: "Quotation record deleted successfully.",
  });
});

// 5. Export PWU Responses to CSV (Admin protected)
export const exportPwuResponsesCsv = asyncHandler(async (req, res) => {
  const responses = await PwuResponse.find({}).sort({ createdAt: -1 });

  const headers = [
    "Date",
    "Author Name",
    "Author Number",
    "Author Email",
    "Author Address",
    "Book Name",
    "Book Language",
    "Page Count (A5)",
    "Copies Needed",
    "Addons",
    "Status",
    "Admin Notes",
  ];

  const escapeCsv = (str) => {
    const s = String(str || "").replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = responses.map((r) => [
    escapeCsv(new Date(r.createdAt).toLocaleString("en-IN")),
    escapeCsv(r.authorName),
    escapeCsv(r.authorNumber),
    escapeCsv(r.authorEmail),
    escapeCsv(r.authorAddress),
    escapeCsv(r.bookName),
    escapeCsv(r.bookLanguage),
    escapeCsv(r.bookPageCount),
    escapeCsv(r.copiesNeeded),
    escapeCsv(r.selectedAddons?.join(", ")),
    escapeCsv(r.status),
    escapeCsv(r.adminNotes),
  ]);

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="pwu-form-responses-${Date.now()}.csv"`);
  res.send(csvContent);
});

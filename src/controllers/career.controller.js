import fs from "fs";
import { CareerResponse } from "../models/CareerResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { env } from "../config/env.js";
import { sendEmailViaResend } from "../services/mail.service.js";
import { persistUploadedFile } from "../services/storage.service.js";

// 1. Submit Career Application (Public)
export const submitCareerApplication = asyncHandler(async (req, res) => {
  const {
    name,
    number,
    email,
    state,
    hometown,
    pin,
    address,
    role,
    experience,
    portfolioUrl,
  } = req.body;

  if (!name?.trim()) {
    throw new ApiError(400, "Full Name is required.");
  }

  const cleanNumber = String(number || "").replace(/\D/g, "");
  if (!cleanNumber || cleanNumber.length < 10) {
    throw new ApiError(400, "Please provide a valid 10-digit mobile number.");
  }

  if (!email?.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new ApiError(400, "A valid Mail ID is required.");
  }

  if (!state?.trim()) {
    throw new ApiError(400, "State is required.");
  }

  if (!hometown?.trim()) {
    throw new ApiError(400, "Hometown is required.");
  }

  const cleanPin = String(pin || "").replace(/\D/g, "");
  if (!cleanPin || cleanPin.length !== 6) {
    throw new ApiError(400, "Please provide a valid 6-digit Pin code.");
  }

  if (!address?.trim()) {
    throw new ApiError(400, "Address is required.");
  }

  if (!role?.trim()) {
    throw new ApiError(400, "Please select the role you want to join as.");
  }

  if (!experience?.trim()) {
    throw new ApiError(400, "Brief Experience / Reason to join is required.");
  }

  if (!req.file && !req.body.resumeUrl) {
    throw new ApiError(400, "Resume PDF file is mandatory. Please upload your resume in PDF format.");
  }

  let resumeFileObj = undefined;
  let finalResumeUrl = req.body.resumeUrl?.trim() || "";
  let resumeAttachmentContent = null;

  if (req.file) {
    if (fs.existsSync(req.file.path)) {
      try {
        resumeAttachmentContent = fs.readFileSync(req.file.path).toString("base64");
      } catch (readErr) {
        console.warn("[Career Application] Failed to read resume file buffer:", readErr);
      }
    }
    resumeFileObj = await persistUploadedFile(req.file, "resumes", "raw");
    finalResumeUrl = resumeFileObj?.url || "";
  }

  const application = await CareerResponse.create({
    user: req.user?._id || null,
    name: name.trim(),
    number: cleanNumber,
    email: email.trim().toLowerCase(),
    state: state.trim(),
    hometown: hometown.trim(),
    pin: cleanPin,
    address: address.trim(),
    role: role.trim(),
    experience: experience.trim(),
    portfolioUrl: portfolioUrl?.trim() || "",
    resumeUrl: finalResumeUrl,
    resumeFile: resumeFileObj,
    status: "Pending",
  });

  // Async notifications via Resend (non-blocking)
  try {
    const adminEmails = env.adminEmails || ["lekhok.tripura@gmail.com"];
    const serverOrigin = env.siteUrl || "https://www.lekhoktripura.in";
    const resumeFullUrl = finalResumeUrl.startsWith("http")
      ? finalResumeUrl
      : `${serverOrigin}${finalResumeUrl}`;

    const adminHtml = `
      <div style="font-family:Arial,sans-serif;background:#0b0f17;color:#ffffff;padding:28px;border-radius:14px;max-width:640px;">
        <h2 style="color:#38bdf8;margin-top:0;">💼 New Career Application Received</h2>
        <p style="color:#94a3b8;font-size:14px;">A candidate has applied to join the Lekhok Tripura team.</p>
        
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;color:#e2e8f0;">
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;width:35%;">ROLE APPLIED</td>
            <td style="padding:10px 0;font-weight:bold;color:#facc15;">${application.role}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">APPLICANT NAME</td>
            <td style="padding:10px 0;">${application.name}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">MOBILE NUMBER</td>
            <td style="padding:10px 0;">${application.number}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">MAIL ID</td>
            <td style="padding:10px 0;">${application.email}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">HOMETOWN / STATE</td>
            <td style="padding:10px 0;">${application.hometown}, ${application.state} (PIN: ${application.pin})</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">ADDRESS</td>
            <td style="padding:10px 0;">${application.address}</td>
          </tr>
          ${
            finalResumeUrl
              ? `<tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
                  <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">RESUME (PDF)</td>
                  <td style="padding:10px 0;"><a href="${resumeFullUrl}" target="_blank" style="color:#38bdf8;font-weight:bold;text-decoration:underline;">📄 Download / View Attached PDF</a></td>
                </tr>`
              : ""
          }
          ${
            application.portfolioUrl
              ? `<tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
                  <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">PORTFOLIO / LINK</td>
                  <td style="padding:10px 0;"><a href="${application.portfolioUrl}" target="_blank" style="color:#60a5fa;">${application.portfolioUrl}</a></td>
                </tr>`
              : ""
          }
          ${
            application.experience
              ? `<tr>
                  <td style="padding:10px 0;font-weight:bold;color:#38bdf8;">EXPERIENCE / BIO</td>
                  <td style="padding:10px 0;">${application.experience}</td>
                </tr>`
              : ""
          }
        </table>
        
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">Manage this applicant in the Admin Panel under <strong>Careers Responses</strong>.</p>
      </div>
    `;

    if (env.resendApiKey) {
      const resendAttachments = [];
      if (resumeAttachmentContent && req.file?.originalname) {
        resendAttachments.push({
          filename: req.file.originalname,
          content: resumeAttachmentContent,
        });
      }

      await sendEmailViaResend({
        to: adminEmails,
        subject: `[Career Application] ${application.name} applied for "${application.role}"`,
        html: adminHtml,
        text: `New career application from ${application.name} (${application.number}) for ${application.role}.\nResume: ${resumeFullUrl}`,
        attachments: resendAttachments.length ? resendAttachments : undefined,
      }).catch((e) => console.error("[Career Email] Admin alert error:", e.message));

      const candidateHtml = `
        <div style="font-family:Arial,sans-serif;background:#0b0f17;color:#ffffff;padding:28px;border-radius:14px;max-width:600px;">
          <h2 style="color:#38bdf8;margin-top:0;">Lekhok Tripura Careers</h2>
          <p>Dear <strong>${application.name}</strong>,</p>
          <p>Thank you for your interest in joining <strong>Lekhok Tripura</strong> for the role of <strong>${application.role}</strong>.</p>
          <p>We have successfully received your application along with your submitted resume. Our recruitment team will review your profile and reach out if your background matches our requirements.</p>
          <p>Best wishes,</p>
          <p style="color:#94a3b8;font-size:13px;">Warm Regards,<br/><strong style="color:#ffffff;">Team Lekhok Tripura</strong><br/>Tripura, India</p>
        </div>
      `;

      await sendEmailViaResend({
        to: [application.email],
        subject: `Application Received for ${application.role} — Lekhok Tripura`,
        html: candidateHtml,
        text: `Dear ${application.name}, thank you for applying for ${application.role} at Lekhok Tripura. We have received your application.`
      }).catch((e) => console.error("[Career Email] Candidate confirm error:", e.message));
    }
  } catch (mailErr) {
    console.warn("[Career Email] Notification warning:", mailErr.message);
  }

  res.status(201).json({
    success: true,
    message: "Thank you! Your career application has been submitted successfully.",
    application,
  });
});

// 2. Get All Career Responses (Admin protected)
export const getAllCareerResponses = asyncHandler(async (req, res) => {
  const {
    search,
    role,
    status,
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const filter = {};

  if (search && search.trim()) {
    const s = search.trim();
    filter.$or = [
      { name: { $regex: s, $options: "i" } },
      { number: { $regex: s, $options: "i" } },
      { email: { $regex: s, $options: "i" } },
      { hometown: { $regex: s, $options: "i" } },
      { state: { $regex: s, $options: "i" } },
    ];
  }

  if (role && role !== "All") {
    filter.role = role;
  }

  if (status && status !== "All") {
    filter.status = status;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  const [responses, total] = await Promise.all([
    CareerResponse.find(filter)
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    CareerResponse.countDocuments(filter),
  ]);

  // Aggregate stats
  const statsAggregate = await CareerResponse.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const stats = {
    total: 0,
    pending: 0,
    reviewed: 0,
    shortlisted: 0,
    interviewed: 0,
    hired: 0,
    rejected: 0,
  };

  statsAggregate.forEach((item) => {
    const key = (item._id || "").toLowerCase();
    if (stats[key] !== undefined) {
      stats[key] = item.count;
    }
    stats.total += item.count;
  });

  res.json({
    success: true,
    data: responses,
    stats,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum) || 1,
    },
  });
});

// 3. Update Status / Admin Notes (Admin protected)
export const updateCareerResponse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, adminNotes } = req.body;

  const updateFields = {};
  if (status) {
    const validStatuses = ["Pending", "Reviewed", "Shortlisted", "Interviewed", "Hired", "Rejected"];
    if (!validStatuses.includes(status)) {
      throw new ApiError(400, "Invalid status provided.");
    }
    updateFields.status = status;
  }
  if (adminNotes !== undefined) {
    updateFields.adminNotes = adminNotes;
  }

  const updated = await CareerResponse.findByIdAndUpdate(
    id,
    { $set: updateFields },
    { new: true }
  );

  if (!updated) {
    throw new ApiError(404, "Career response record not found.");
  }

  res.json({
    success: true,
    message: "Application updated successfully.",
    data: updated,
  });
});

// 4. Delete Career Response (Admin protected)
export const deleteCareerResponse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await CareerResponse.findByIdAndDelete(id);

  if (!deleted) {
    throw new ApiError(404, "Career response record not found.");
  }

  res.json({
    success: true,
    message: "Application record deleted.",
  });
});

// 5. Export Career Responses as CSV (Admin protected)
export const exportCareerResponsesCsv = asyncHandler(async (_req, res) => {
  const items = await CareerResponse.find().sort({ createdAt: -1 }).lean();

  const headers = [
    "Application ID",
    "Date",
    "Candidate Name",
    "Role Applied",
    "Phone Number",
    "Mail ID",
    "Hometown",
    "State",
    "PIN",
    "Address",
    "Resume URL",
    "Portfolio URL",
    "Experience / Bio",
    "Status",
    "Admin Notes",
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = items.map((item) => [
    escapeCsv(item._id),
    escapeCsv(item.createdAt ? new Date(item.createdAt).toISOString() : ""),
    escapeCsv(item.name),
    escapeCsv(item.role),
    escapeCsv(item.number),
    escapeCsv(item.email),
    escapeCsv(item.hometown),
    escapeCsv(item.state),
    escapeCsv(item.pin),
    escapeCsv(item.address),
    escapeCsv(item.resumeUrl || item.resumeFile?.url || ""),
    escapeCsv(item.portfolioUrl || ""),
    escapeCsv(item.experience || ""),
    escapeCsv(item.status),
    escapeCsv(item.adminNotes || ""),
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="lekhok-careers-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.status(200).send(csvContent);
});

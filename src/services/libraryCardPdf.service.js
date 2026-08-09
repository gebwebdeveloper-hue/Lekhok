import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PassThrough } from "stream";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import bwipjs from "bwip-js";
import { cloudinary } from "../config/cloudinary.js";
import { env } from "../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "../../uploads/library-cards");
const assetsDir = path.resolve(__dirname, "../assets");
const logoPath = path.resolve(assetsDir, "logo.png");
const clientLogoPath = path.resolve(__dirname, "../../../Client/public/logo.png");

// Ensure local fallback directories exist
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
if (!fs.existsSync(logoPath) && fs.existsSync(clientLogoPath)) {
  try { fs.copyFileSync(clientLogoPath, logoPath); } catch (err) {
    console.error("Could not copy logo to assets dir:", err);
  }
}

// Helper to draw QR Code graphic
function drawQrCodeGraphic(doc, x, y, size) {
  doc.roundedRect(x, y, size, size, 4).fillAndStroke("#ffffff", "#111111");
  doc.rect(x + 4, y + 4, size - 8, size - 8).lineWidth(0.8).strokeColor("#111111").stroke();

  doc.rect(x + 6, y + 6, 10, 10).fill("#111111");
  doc.rect(x + size - 16, y + 6, 10, 10).fill("#111111");
  doc.rect(x + 6, y + size - 16, 10, 10).fill("#111111");

  doc.rect(x + 8, y + 8, 6, 6).fill("#ffffff");
  doc.rect(x + size - 14, y + 8, 6, 6).fill("#ffffff");
  doc.rect(x + 8, y + size - 14, 6, 6).fill("#ffffff");

  doc.rect(x + 10, y + 10, 2, 2).fill("#111111");
  doc.rect(x + size - 12, y + 10, 2, 2).fill("#111111");
  doc.rect(x + 10, y + size - 12, 2, 2).fill("#111111");

  doc.rect(x + 20, y + 7, 3, 3).fill("#111111");
  doc.rect(x + 25, y + 12, 4, 3).fill("#111111");
  doc.rect(x + 18, y + 20, 3, 4).fill("#111111");
  doc.rect(x + 26, y + 22, 5, 3).fill("#111111");
  doc.rect(x + 7, y + 22, 4, 3).fill("#111111");
  doc.rect(x + 32, y + 16, 3, 5).fill("#111111");
}

// Helper to draw vector Barcode graphic
function drawBarcodeGraphic(doc, x, y, width, height, codeText) {
  doc.roundedRect(x, y, width, height, 4).fillAndStroke("#ffffff", "#111111");
  const startX = x + 10;
  const barTop = y + 6;
  const barHeight = height - 20;
  const barPattern = [2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 1, 2, 1, 3, 1, 2, 1, 4, 2, 1, 3, 1, 2, 3, 1, 2];
  let currX = startX;
  for (let i = 0; i < barPattern.length && currX < x + width - 12; i++) {
    const w = barPattern[i];
    if (i % 2 === 0) doc.rect(currX, barTop, w, barHeight).fill("#111111");
    currX += w + 1.2;
  }
  const spacedText = codeText.split("").join(" ");
  doc.fillColor("#111111").fontSize(7.5).font("Helvetica-Bold").text(spacedText, x, y + height - 12, { align: "center", width });
}

/**
 * Upload a PDF Buffer directly to Cloudinary.
 * Returns: { url, publicId, fileName, storage }
 */
export async function uploadPdfBufferToCloudinary(pdfBuffer, cardId) {
  const fileName = `library-card-${cardId}.pdf`;
  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "lekhak/library-cards",
        public_id: `library-card-${cardId}`,
        resource_type: "raw",
        type: "upload",      // explicitly public — prevents 401 on some Cloudinary accounts
        format: "pdf",
        overwrite: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(pdfBuffer);
  });

  return {
    url: result.secure_url,
    fileName,
    storage: "cloudinary",
    publicId: result.public_id,
  };
}

/** Generate the PDF document, collect it into a Buffer, then either:
 *  1. Upload to Cloudinary (when CLOUDINARY_CLOUD_NAME is configured) — throws on failure,
 *  2. Save to local disk only when Cloudinary is NOT configured.
 *
 *  Returns: { url, filePath (local only), fileName, storage }
 */
/**
 * Build the library-card PDF in-memory and return its Buffer.
 * This can be used to stream the PDF directly to the client without
 * going through Cloudinary (useful when Cloudinary has restricted delivery).
 */
export async function buildLibraryCardPdfBuffer(cardData) {
  // Generate real scannable QR Code buffer pointing to the direct Library Card PDF URL
  const baseUrl = env.serverUrl || (env.nodeEnv === "production" ? "https://lekhok.onrender.com" : "http://localhost:5000");
  const qrContent = `${baseUrl}/api/library-card/download/${cardData.cardId}`;
  let qrBuffer = null;
  try {
    qrBuffer = await QRCode.toBuffer(qrContent, {
      width: 250,
      margin: 1,
      color: { dark: "#111111", light: "#ffffff" }
    });
  } catch (err) {
    console.error("[QR Code] Failed to generate buffer:", err);
  }

  // Generate real scannable Code128 Barcode buffer
  let barcodeBuffer = null;
  try {
    barcodeBuffer = await bwipjs.toBuffer({
      bcid: "code128",
      text: cardData.cardId,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: "center",
      backgroundcolor: "FFFFFF"
    });
  } catch (err) {
    console.error("[Barcode] Failed to generate buffer:", err);
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [560, 590], margin: 0 });
      const pass = new PassThrough();
      const chunks = [];
      pass.on("data", (chunk) => chunks.push(chunk));
      pass.on("end", () => resolve(Buffer.concat(chunks)));
      pass.on("error", reject);
      doc.pipe(pass);

      // Sheet Background
      doc.rect(0, 0, 560, 590).fill("#f4f4f5");

      // ==========================================
      // CARD 1: FRONT SIDE (Y: 20 to 280)
      // ==========================================
      const card1X = 20, card1Y = 20, cardWidth = 520, cardHeight = 260;

      doc.roundedRect(card1X, card1Y, cardWidth, cardHeight, 16).fillAndStroke("#ffffff", "#e4e4e7");

      doc.save();
      doc.roundedRect(card1X, card1Y, cardWidth, cardHeight, 16).clip();
      doc.moveTo(card1X, card1Y)
        .lineTo(card1X + 175, card1Y)
        .bezierCurveTo(card1X + 195, card1Y + 90, card1X + 145, card1Y + 170, card1X + 185, card1Y + cardHeight)
        .lineTo(card1X, card1Y + cardHeight)
        .closePath()
        .fill("#111111");

      const emblemCenterX = card1X + 85;
      const emblemCenterY = card1Y + cardHeight / 2 - 10;

      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, emblemCenterX - 48, emblemCenterY - 48, { width: 96, height: 96 });
      } else {
        doc.fillColor("#ffffff").fontSize(14).font("Helvetica-Bold").text("LEKHOK", emblemCenterX - 30, emblemCenterY - 12, { width: 60, align: "center" });
        doc.fillColor("#a1a1aa").fontSize(8).font("Helvetica").text("TRIPURA", emblemCenterX - 30, emblemCenterY + 4, { width: 60, align: "center" });
      }
      doc.restore();

      const rightX = card1X + 205;
      doc.fillColor("#111111").fontSize(22).font("Helvetica-Bold").text("LEKHOK TRIPURA", rightX, card1Y + 24);
      doc.fillColor("#52525b").fontSize(10).font("Helvetica-Bold").text("—  L I B R A R Y  —", rightX, card1Y + 52);
      doc.fillColor("#71717a").fontSize(8.5).font("Helvetica").text("READ  |  THINK  |  WRITE  |  TRANSFORM", rightX, card1Y + 70);

      doc.roundedRect(rightX, card1Y + 98, 145, 26, 6).fill("#111111");
      doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold").text("LIBRARY CARD", rightX, card1Y + 106, { width: 145, align: "center" });

      doc.fillColor("#52525b").fontSize(10).font("Helvetica").text("CARD ID:", rightX, card1Y + 142);
      doc.fillColor("#111111").fontSize(15).font("Helvetica-Bold").text(cardData.cardId, rightX + 62, card1Y + 139);

      if (qrBuffer) {
        doc.roundedRect(card1X + cardWidth - 62, card1Y + 18, 48, 48, 6).fillAndStroke("#ffffff", "#111111");
        doc.image(qrBuffer, card1X + cardWidth - 60, card1Y + 20, { width: 44, height: 44 });
      } else {
        drawQrCodeGraphic(doc, card1X + cardWidth - 56, card1Y + 22, 38);
      }

      doc.save();
      doc.roundedRect(card1X, card1Y, cardWidth, cardHeight, 16).clip();
      doc.rect(card1X, card1Y + cardHeight - 32, cardWidth, 32).fill("#111111");
      doc.fillColor("#ffffff").fontSize(8).font("Helvetica").text(
        "www.lekhoktripura.in     |     lekhok.tripura@gmail.com     |     Agartala, Tripura",
        card1X, card1Y + cardHeight - 20, { align: "center", width: cardWidth }
      );
      doc.restore();

      // ==========================================
      // CARD 2: BACK SIDE (Y: 300 to 560)
      // ==========================================
      const card2X = 20, card2Y = 300;
      doc.roundedRect(card2X, card2Y, cardWidth, cardHeight, 16).fillAndStroke("#ffffff", "#e4e4e7");

      doc.roundedRect(card2X + 16, card2Y + 16, 175, 20, 4).fill("#111111");
      doc.fillColor("#ffffff").fontSize(8.5).font("Helvetica-Bold").text("TERMS & CONDITIONS", card2X + 16, card2Y + 22, { width: 175, align: "center" });

      const termsList = [
        "This card is non-transferable.",
        "The cardholder is responsible for all books issued.",
        "Books must be returned on or before the due date.",
        "Fine charged for late return or damaged books.",
        "Inform the library for any change in contact info."
      ];
      let termY = card2Y + 48;
      termsList.forEach((term) => {
        doc.circle(card2X + 28, termY + 4, 2.5).fill("#111111");
        doc.fillColor("#3f3f46").fontSize(7.5).font("Helvetica").text(term, card2X + 36, termY, { width: 175 });
        termY += 21;
      });

      if (fs.existsSync(logoPath)) {
        doc.save();
        doc.opacity(0.06);
        doc.image(logoPath, card2X + 185, card2Y + 70, { width: 110, height: 110 });
        doc.restore();
      }

      const detailsX = card2X + 225;
      const labelW = 68;
      let detailY = card2Y + 28;
      const detailsData = [
        { label: "Name", value: cardData.userName },
        { label: "Member ID", value: cardData.cardId },
        { label: "Mobile", value: cardData.userPhone },
        { label: "Email", value: cardData.userEmail },
        {
          label: "Address",
          value: [cardData.villageTown, cardData.postOffice, cardData.policeStation, cardData.district,
            cardData.state ? `${cardData.state}${cardData.pinCode ? ` - ${cardData.pinCode}` : ""}` : cardData.pinCode
          ].filter(Boolean).join(", ")
        }
      ];
      detailsData.forEach((item) => {
        doc.font("Helvetica").fontSize(8.5);
        const textVal = item.value || "N/A";
        const valHeight = doc.heightOfString(textVal, { width: 195, lineGap: 2 });
        const textHeight = Math.max(12, valHeight);

        doc.fillColor("#52525b").fontSize(8).font("Helvetica-Bold").text(item.label, detailsX, detailY, { width: labelW });
        doc.fillColor("#52525b").fontSize(8).font("Helvetica-Bold").text(":", detailsX + labelW, detailY);
        doc.fillColor("#111111").fontSize(8.5).font("Helvetica").text(textVal, detailsX + labelW + 10, detailY, { width: 195, lineGap: 2 });

        const lineY = detailY + textHeight + 3;
        doc.moveTo(detailsX + labelW + 10, lineY).lineTo(card2X + cardWidth - 20, lineY).strokeColor("#e4e4e7").lineWidth(0.8).stroke();
        detailY = lineY + 5;
      });

      const barcodeX = card2X + cardWidth - 190;
      const barcodeY = card2Y + cardHeight - 65;
      const barcodeW = 170;
      const barcodeH = 38;

      if (barcodeBuffer) {
        doc.roundedRect(barcodeX, barcodeY, barcodeW, barcodeH, 4).fillAndStroke("#ffffff", "#111111");
        doc.image(barcodeBuffer, barcodeX + 4, barcodeY + 2, { width: barcodeW - 8, height: barcodeH - 4 });
      } else {
        drawBarcodeGraphic(doc, barcodeX, barcodeY, barcodeW, barcodeH, cardData.cardId);
      }

      doc.fillColor("#52525b").fontSize(8.5).font("Helvetica-Oblique").text(
        "\"One Book, One Thought, One Transformation.\"",
        card2X + 16, card2Y + cardHeight - 22, { align: "left", width: 280 }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function generateLibraryCardPdf(cardData) {
  const fileName = `library-card-${cardData.cardId}.pdf`;

  // Build PDF in-memory
  const pdfBuffer = await buildLibraryCardPdfBuffer(cardData);

  // ── Upload to Cloudinary if configured, otherwise save locally ──
  const useCloudinary = env.cloudinary?.cloudName && env.cloudinary?.apiKey && env.cloudinary?.apiSecret;

  if (useCloudinary) {
    // Throws on failure — never silently fall back to local when Cloudinary is configured.
    return await uploadPdfBufferToCloudinary(pdfBuffer, cardData.cardId);
  }

  // Fallback: write to local disk (only when Cloudinary is NOT configured)
  const filePath = path.join(uploadsDir, fileName);
  await fs.promises.writeFile(filePath, pdfBuffer);
  return {
    url: `/uploads/library-cards/${fileName}`,
    filePath,
    fileName,
    storage: "local",
  };
}

/**
 * Build the Club Membership Card PDF as an in-memory Buffer.
 */
export async function buildClubCardPdfBuffer(memberData) {
  const baseUrl = env.serverUrl || (env.nodeEnv === "production" ? "https://lekhok.onrender.com" : "http://localhost:5000");
  const qrContent = `${baseUrl}/club`;
  let qrBuffer = null;
  try {
    qrBuffer = await QRCode.toBuffer(qrContent, {
      width: 250,
      margin: 1,
      color: { dark: "#065f46", light: "#ffffff" }
    });
  } catch (err) {
    console.error("[QR Code] Failed to generate buffer:", err);
  }

  let barcodeBuffer = null;
  try {
    barcodeBuffer = await bwipjs.toBuffer({
      bcid: "code128",
      text: memberData.memberId || "LTCLUB-DEMO01",
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: "center",
      backgroundcolor: "FFFFFF"
    });
  } catch (err) {
    console.error("[Barcode] Failed to generate buffer:", err);
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [560, 590], margin: 0 });
      const pass = new PassThrough();
      const chunks = [];
      pass.on("data", (chunk) => chunks.push(chunk));
      pass.on("end", () => resolve(Buffer.concat(chunks)));
      pass.on("error", reject);
      doc.pipe(pass);

      // Background
      doc.rect(0, 0, 560, 590).fill("#f0fdf4");

      // ==========================================
      // CARD 1: FRONT SIDE
      // ==========================================
      const card1X = 20, card1Y = 20, cardWidth = 520, cardHeight = 260;

      doc.roundedRect(card1X, card1Y, cardWidth, cardHeight, 16).fillAndStroke("#ffffff", "#bbf7d0");

      doc.save();
      doc.roundedRect(card1X, card1Y, cardWidth, cardHeight, 16).clip();
      doc.moveTo(card1X, card1Y)
        .lineTo(card1X + 175, card1Y)
        .bezierCurveTo(card1X + 195, card1Y + 90, card1X + 145, card1Y + 170, card1X + 185, card1Y + cardHeight)
        .lineTo(card1X, card1Y + cardHeight)
        .closePath()
        .fill("#064e3b");

      const emblemCenterX = card1X + 85;
      const emblemCenterY = card1Y + cardHeight / 2 - 10;

      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, emblemCenterX - 48, emblemCenterY - 48, { width: 96, height: 96 });
      }

      doc.fillColor("#34d399").fontSize(9.5).font("Helvetica-Bold").text("OFFICIAL CLUB MEMBER", card1X + 10, card1Y + cardHeight - 32, { width: 155, align: "center" });
      doc.restore();

      const detailsX = card1X + 195;
      const detailsY = card1Y + 14;

      doc.fillColor("#065f46").fontSize(14).font("Helvetica-Bold").text("LEKHOK TRIPURA CLUB", detailsX, detailsY);
      doc.fillColor("#047857").fontSize(8.5).font("Helvetica-Bold").text("DIGITAL MEMBERSHIP CARD", detailsX, detailsY + 17);

      doc.moveTo(detailsX, detailsY + 28).lineTo(card1X + cardWidth - 16, detailsY + 28).lineWidth(1).strokeColor("#10b981").stroke();

      const infoY = detailsY + 34;
      const lineGap = 17;

      doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("MEMBER ID", detailsX, infoY);
      doc.fillColor("#064e3b").fontSize(11).font("Helvetica-Bold").text(memberData.memberId || "LTCLUB-DEMO01", detailsX + 75, infoY - 1);

      doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("NAME", detailsX, infoY + lineGap);
      doc.fillColor("#0f172a").fontSize(10).font("Helvetica-Bold").text(memberData.fullName || "Sample Member (Demo)", detailsX + 75, infoY + lineGap - 1, { width: 230 });

      doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("ROLE", detailsX, infoY + lineGap * 2);
      doc.fillColor("#047857").fontSize(9.5).font("Helvetica-Bold").text(memberData.role || "Lifetime Member", detailsX + 75, infoY + lineGap * 2 - 1);

      doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("EMAIL", detailsX, infoY + lineGap * 3);
      doc.fillColor("#334155").fontSize(8.5).font("Helvetica").text(memberData.email || "lekhok.tripura@gmail.com", detailsX + 75, infoY + lineGap * 3 - 1);

      doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("VALIDITY", detailsX, infoY + lineGap * 4);
      doc.fillColor("#059669").fontSize(9).font("Helvetica-Bold").text("LIFETIME VALID", detailsX + 75, infoY + lineGap * 4 - 1);

      if (qrBuffer) {
        doc.image(qrBuffer, card1X + cardWidth - 96, infoY + lineGap * 3, { width: 80, height: 80 });
      }

      // ==========================================
      // CARD 2: BACK SIDE
      // ==========================================
      const card2X = 20, card2Y = 305;
      doc.roundedRect(card2X, card2Y, cardWidth, cardHeight, 16).fillAndStroke("#ffffff", "#bbf7d0");

      doc.fillColor("#065f46").fontSize(12).font("Helvetica-Bold").text("LEKHOK TRIPURA CLUB - OFFICIAL MEMBER", card2X + 16, card2Y + 14);
      doc.moveTo(card2X + 16, card2Y + 30).lineTo(card2X + cardWidth - 16, card2Y + 30).lineWidth(1).strokeColor("#10b981").stroke();

      if (barcodeBuffer) {
        doc.image(barcodeBuffer, card2X + 16, card2Y + 38, { width: 220, height: 50 });
      }

      const backTextY = card2Y + 98;
      doc.fillColor("#334155").fontSize(8).font("Helvetica").text("1. This digital membership card grants lifetime 10% discount on book publishing.", card2X + 16, backTextY, { width: 480 });
      doc.fillColor("#334155").fontSize(8).font("Helvetica").text("2. Includes priority branding, author visiting cards, & literary workshop invites.", card2X + 16, backTextY + 14, { width: 480 });
      doc.fillColor("#334155").fontSize(8).font("Helvetica").text("3. Scan the QR code to verify member authenticity online at lekhoktripura.in.", card2X + 16, backTextY + 28, { width: 480 });

      doc.moveTo(card2X + 16, card2Y + cardHeight - 32).lineTo(card2X + cardWidth - 16, card2Y + cardHeight - 32).lineWidth(0.5).strokeColor("#e2e8f0").stroke();

      doc.fillColor("#047857").fontSize(8.5).font("Helvetica-Oblique").text(
        "\"Connecting Readers, Writers & Literature Across Tripura.\"",
        card2X + 16, card2Y + cardHeight - 22, { align: "left", width: 400 }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}


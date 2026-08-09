import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "../../uploads/library-cards");
const assetsDir = path.resolve(__dirname, "../assets");
const logoPath = path.resolve(assetsDir, "logo.png");
const clientLogoPath = path.resolve(__dirname, "../../../Client/public/logo.png");

// Ensure upload & assets directories exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}
if (!fs.existsSync(logoPath) && fs.existsSync(clientLogoPath)) {
  try {
    fs.copyFileSync(clientLogoPath, logoPath);
  } catch (err) {
    console.error("Could not copy logo to assets dir:", err);
  }
}

// Helper to draw QR Code graphic
function drawQrCodeGraphic(doc, x, y, size) {
  doc.roundedRect(x, y, size, size, 4).fillAndStroke("#ffffff", "#111111");
  doc.rect(x + 4, y + 4, size - 8, size - 8).lineWidth(0.8).strokeColor("#111111").stroke();
  
  // Position squares
  doc.rect(x + 6, y + 6, 10, 10).fill("#111111");
  doc.rect(x + size - 16, y + 6, 10, 10).fill("#111111");
  doc.rect(x + 6, y + size - 16, 10, 10).fill("#111111");
  
  doc.rect(x + 8, y + 8, 6, 6).fill("#ffffff");
  doc.rect(x + size - 14, y + 8, 6, 6).fill("#ffffff");
  doc.rect(x + 8, y + size - 14, 6, 6).fill("#ffffff");

  doc.rect(x + 10, y + 10, 2, 2).fill("#111111");
  doc.rect(x + size - 12, y + 10, 2, 2).fill("#111111");
  doc.rect(x + 10, y + size - 12, 2, 2).fill("#111111");

  // Sample data pixels
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
    if (i % 2 === 0) {
      doc.rect(currX, barTop, w, barHeight).fill("#111111");
    }
    currX += w + 1.2;
  }

  const spacedText = codeText.split("").join(" ");
  doc.fillColor("#111111").fontSize(7.5).font("Helvetica-Bold").text(spacedText, x, y + height - 12, { align: "center", width });
}

export async function generateLibraryCardPdf(cardData) {
  return new Promise((resolve, reject) => {
    try {
      const fileName = `library-card-${cardData.cardId}.pdf`;
      const filePath = path.join(uploadsDir, fileName);
      const relativeUrl = `/uploads/library-cards/${fileName}`;

      // Single sheet holding FRONT (Top) and BACK (Bottom) cards (560x590 pt)
      const doc = new PDFDocument({
        size: [560, 590],
        margin: 0,
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // Sheet Background
      doc.rect(0, 0, 560, 590).fill("#f4f4f5");

      // ==========================================
      // CARD 1: FRONT SIDE (Y: 20 to 280)
      // ==========================================
      const card1X = 20;
      const card1Y = 20;
      const cardWidth = 520;
      const cardHeight = 260;

      // Outer White Card Box with Shadow border
      doc.roundedRect(card1X, card1Y, cardWidth, cardHeight, 16).fillAndStroke("#ffffff", "#e4e4e7");

      // Left Dark Curved Badge
      doc.save();
      doc.roundedRect(card1X, card1Y, cardWidth, cardHeight, 16).clip();
      
      // Black curved left section fill
      doc.moveTo(card1X, card1Y)
         .lineTo(card1X + 175, card1Y)
         .bezierCurveTo(card1X + 195, card1Y + 90, card1X + 145, card1Y + 170, card1X + 185, card1Y + cardHeight)
         .lineTo(card1X, card1Y + cardHeight)
         .closePath()
         .fill("#111111");

      // Concentric circles logo emblem on left badge
      const emblemCenterX = card1X + 85;
      const emblemCenterY = card1Y + cardHeight / 2 - 10;
      
      doc.circle(emblemCenterX, emblemCenterY, 62).lineWidth(2).strokeColor("#ffffff").stroke();
      doc.circle(emblemCenterX, emblemCenterY, 56).lineWidth(1).strokeColor("#ffffff").stroke();
      doc.circle(emblemCenterX, emblemCenterY, 50).lineWidth(1.5).strokeColor("#ffffff").stroke();

      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, emblemCenterX - 42, emblemCenterY - 42, { width: 84, height: 84 });
      } else {
        doc.fillColor("#ffffff").fontSize(14).font("Helvetica-Bold").text("LEKHOK", emblemCenterX - 30, emblemCenterY - 12, { width: 60, align: "center" });
        doc.fillColor("#a1a1aa").fontSize(8).font("Helvetica").text("TRIPURA", emblemCenterX - 30, emblemCenterY + 4, { width: 60, align: "center" });
      }
      doc.restore();

      // Right Section Text (X = 210)
      const rightX = card1X + 205;

      // Top Title (Bengali / English brand name)
      doc.fillColor("#111111").fontSize(22).font("Helvetica-Bold").text("LEKHOK TRIPURA", rightX, card1Y + 24);
      doc.fillColor("#52525b").fontSize(10).font("Helvetica-Bold").text("—  L I B R A R Y  —", rightX, card1Y + 52);

      // Bengali Motto: Read | Think | Write | Transform
      doc.fillColor("#71717a").fontSize(8.5).font("Helvetica").text("READ  |  THINK  |  WRITE  |  TRANSFORM", rightX, card1Y + 70);

      // Black Pill Button Badge: LIBRARY CARD
      doc.roundedRect(rightX, card1Y + 98, 145, 26, 6).fill("#111111");
      doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold").text("LIBRARY CARD", rightX, card1Y + 106, { width: 145, align: "center" });

      // CARD ID Label & Value
      doc.fillColor("#52525b").fontSize(10).font("Helvetica").text("CARD ID:", rightX, card1Y + 142);
      doc.fillColor("#111111").fontSize(15).font("Helvetica-Bold").text(cardData.cardId, rightX + 62, card1Y + 139);

      // QR Code Box Graphic at Top Right
      drawQrCodeGraphic(doc, card1X + cardWidth - 56, card1Y + 22, 38);

      // Bottom Black Contact Bar
      doc.save();
      doc.roundedRect(card1X, card1Y, cardWidth, cardHeight, 16).clip();
      doc.rect(card1X, card1Y + cardHeight - 32, cardWidth, 32).fill("#111111");
      doc.fillColor("#ffffff").fontSize(8).font("Helvetica").text(
        "www.lekhoktripura.in     |     info@lekhoktripura.in     |     Agartala, Tripura",
        card1X,
        card1Y + cardHeight - 20,
        { align: "center", width: cardWidth }
      );
      doc.restore();


      // ==========================================
      // CARD 2: BACK SIDE (Y: 300 to 560)
      // ==========================================
      const card2X = 20;
      const card2Y = 300;

      // Outer White Card Box
      doc.roundedRect(card2X, card2Y, cardWidth, cardHeight, 16).fillAndStroke("#ffffff", "#e4e4e7");

      // Top Black Pill Box: TERMS & CONDITIONS
      doc.roundedRect(card2X + 16, card2Y + 16, 175, 20, 4).fill("#111111");
      doc.fillColor("#ffffff").fontSize(8.5).font("Helvetica-Bold").text("TERMS & CONDITIONS", card2X + 16, card2Y + 22, { width: 175, align: "center" });

      // Left Column: Terms Bullet Points (X = 26, Y = 46)
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

      // Center Watermark Emblem
      if (fs.existsSync(logoPath)) {
        doc.save();
        doc.opacity(0.06);
        doc.image(logoPath, card2X + 185, card2Y + 70, { width: 110, height: 110 });
        doc.restore();
      }

      // Right Column: Member Details (X = 230)
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
          value: [
            cardData.villageTown,
            cardData.postOffice,
            cardData.policeStation,
            cardData.district,
            cardData.state ? `${cardData.state}${cardData.pinCode ? ` - ${cardData.pinCode}` : ""}` : cardData.pinCode
          ].filter(Boolean).join(", ")
        }
      ];

      detailsData.forEach((item) => {
        doc.fillColor("#52525b").fontSize(8).font("Helvetica-Bold").text(item.label, detailsX, detailY, { width: labelW });
        doc.fillColor("#52525b").fontSize(8).font("Helvetica-Bold").text(":", detailsX + labelW, detailY);
        doc.fillColor("#111111").fontSize(8.5).font("Helvetica").text(item.value || "N/A", detailsX + labelW + 10, detailY, {
          width: 195,
          lineGap: 2
        });
        
        // Underline effect
        const lineY = detailY + 14;
        doc.moveTo(detailsX + labelW + 10, lineY).lineTo(card2X + cardWidth - 20, lineY).strokeColor("#e4e4e7").lineWidth(0.8).stroke();
        
        detailY += item.label === "Address" ? 30 : 20;
      });

      // Bottom Right Barcode Graphic
      drawBarcodeGraphic(doc, card2X + cardWidth - 190, card2Y + cardHeight - 65, 170, 38, cardData.cardId);

      // Bottom Center Footer Motto
      doc.fillColor("#52525b").fontSize(8.5).font("Helvetica-Oblique").text(
        "\"One Book, One Thought, One Transformation.\"",
        card2X + 16,
        card2Y + cardHeight - 22,
        { align: "left", width: 280 }
      );

      doc.end();

      writeStream.on("finish", () => {
        resolve({
          filePath,
          url: relativeUrl,
          fileName,
        });
      });

      writeStream.on("error", (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}

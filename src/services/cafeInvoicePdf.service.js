import PDFDocument from "pdfkit";
import { sendEmail } from "./mail.service.js";

/**
 * Generates a PDF Invoice Buffer using PDFKit
 * @param {Object} order - CafeOrder document or object
 * @returns {Promise<Buffer>} PDF Buffer
 */
export function generateCafeInvoicePdfBuffer(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const buffers = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      // Color Palette
      const primaryColor = "#6B3F2A"; // Warm Brown
      const goldColor = "#D4A85A";    // Gold Accent
      const darkColor = "#140803";    // Dark Charcoal

      // Header Brand Box
      doc
        .rect(40, 40, 515, 75)
        .fill(primaryColor);

      doc
        .fillColor("#FAF5EB")
        .fontSize(20)
        .font("Helvetica-Bold")
        .text("LEKHOK TRIPURA CAFE", 60, 55);

      doc
        .fillColor(goldColor)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("OFFICIAL RECEIPT & TAX INVOICE", 60, 82);

      doc
        .fillColor("#FAF5EB")
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(`Order #${order.orderNumber || order._id}`, 400, 68, { align: "right", width: 140 });

      // Status Badge
      doc
        .rect(435, 88, 105, 18)
        .fill("#22c55e");
      doc
        .fillColor("#ffffff")
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("PAID & COLLECTED", 435, 93, { align: "center", width: 105 });

      // Invoice Details & Customer Info
      doc.fillColor(darkColor).fontSize(10).font("Helvetica");
      const orderDate = new Date(order.createdAt || Date.now()).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short"
      });

      let y = 135;

      // Customer Details Box
      doc
        .rect(40, y, 515, 65)
        .fillAndStroke("#FDFBF7", "#E5D9C5");

      doc.fillColor(primaryColor).fontSize(11).font("Helvetica-Bold").text("Customer & Order Summary", 55, y + 10);

      doc.fillColor(darkColor).fontSize(9).font("Helvetica");
      doc.text(`Customer Name: ${order.customerName || "Valued Guest"}`, 55, y + 28);
      doc.text(`Email: ${order.customerEmail || "N/A"}`, 55, y + 42);

      doc.text(`Date & Time: ${orderDate}`, 320, y + 28);
      doc.text(`Payment Method: ${(order.paymentMethod || "Razorpay").toUpperCase()} (Status: ${order.paymentStatus || "paid"})`, 320, y + 42);

      // Items Table Header
      y += 85;
      doc
        .rect(40, y, 515, 25)
        .fill(primaryColor);

      doc.fillColor("#FAF5EB").fontSize(9).font("Helvetica-Bold");
      doc.text("ITEM DESCRIPTION", 55, y + 8);
      doc.text("QTY", 320, y + 8, { width: 40, align: "center" });
      doc.text("UNIT PRICE", 370, y + 8, { width: 80, align: "right" });
      doc.text("AMOUNT", 460, y + 8, { width: 80, align: "right" });

      y += 25;
      let grandTotal = 0;

      // Render Order Items
      (order.items || []).forEach((item, index) => {
        const itemTotal = (item.price || 0) * (item.quantity || 1);
        grandTotal += itemTotal;

        const rowBg = index % 2 === 0 ? "#FFFFFF" : "#F9F6F0";
        doc.rect(40, y, 515, 25).fill(rowBg);

        doc.fillColor(darkColor).fontSize(9).font("Helvetica");
        doc.text(item.name || "Cafe Item", 55, y + 7, { width: 250, lineBreak: false });
        doc.text(String(item.quantity || 1), 320, y + 7, { width: 40, align: "center" });
        doc.text(`INR ${item.price || 0}`, 370, y + 7, { width: 80, align: "right" });
        doc.text(`INR ${itemTotal}`, 460, y + 7, { width: 80, align: "right" });

        y += 25;
      });

      // Total Box
      y += 10;
      doc
        .rect(300, y, 255, 35)
        .fill(primaryColor);

      doc.fillColor("#FAF5EB").fontSize(11).font("Helvetica-Bold");
      doc.text("TOTAL AMOUNT PAID:", 310, y + 11);
      doc.fillColor(goldColor).fontSize(14).font("Helvetica-Bold");
      doc.text(`INR ${order.totalAmount || grandTotal}`, 450, y + 9, { width: 95, align: "right" });

      // Thank You & Footer
      y += 60;
      doc
        .strokeColor("#E5D9C5")
        .lineWidth(1)
        .moveTo(40, y)
        .lineTo(555, y)
        .stroke();

      y += 15;
      doc
        .fillColor(primaryColor)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("Thank you for visiting Lekhok Tripura Cafe & Library!", 40, y, { align: "center", width: 515 });

      doc
        .fillColor("#777777")
        .fontSize(8)
        .font("Helvetica")
        .text("Where book lovers, writers, and dreamers gather over artisan brews. This is a computer-generated tax invoice.", 40, y + 15, { align: "center", width: 515 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Emails the Cafe Order Bill PDF Receipt to customer email
 * @param {Object} order - CafeOrder document
 */
export async function sendCafeBillEmailWithPdf(order) {
  if (!order || !order.customerEmail) {
    console.log(`[Cafe Bill Email]: No email provided for Order #${order?.orderNumber}`);
    return false;
  }

  try {
    const pdfBuffer = await generateCafeInvoicePdfBuffer(order);
    const fileName = `Lekhok_Tripura_Invoice_${order.orderNumber}.pdf`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #140803; color: #FAF5EB; border-radius: 16px; padding: 24px; border: 1px solid #D4A85A;">
        <div style="text-align: center; border-bottom: 1px solid rgba(212,168,90,0.3); padding-bottom: 16px; margin-bottom: 20px;">
          <h1 style="color: #D4A85A; font-size: 24px; margin: 0;">Lekhok Tripura Cafe</h1>
          <p style="color: #FAF5EB; font-size: 13px; margin-top: 4px;">Your Order #${order.orderNumber} is Collected!</p>
        </div>

        <p style="font-size: 14px; color: #FAF5EB;">Dear <strong>${order.customerName || "Customer"}</strong>,</p>
        <p style="font-size: 13px; color: rgba(250,245,235,0.8); leading-height: 1.6;">
          Thank you for ordering at Lekhok Tripura Cafe! Your order has been marked as <strong>COLLECTED</strong>.
        </p>

        <div style="background: rgba(212,168,90,0.1); border-radius: 12px; padding: 16px; margin: 20px 0; border: 1px solid rgba(212,168,90,0.2);">
          <h3 style="color: #D4A85A; margin-top: 0; font-size: 14px; text-transform: uppercase;">Order Summary</h3>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Order ID:</strong> #${order.orderNumber}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Total Paid:</strong> ₹${order.totalAmount}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Payment Status:</strong> Paid via ${order.paymentMethod || "Razorpay"}</p>
        </div>

        <p style="font-size: 13px; color: rgba(250,245,235,0.8);">
          📎 Your official <strong>PDF Bill Receipt</strong> is attached to this email. You can also download it anytime from your profile/order tracker on our website.
        </p>

        <div style="text-align: center; margin-top: 30px; font-size: 11px; color: rgba(250,245,235,0.5); border-top: 1px solid rgba(212,168,90,0.2); padding-top: 16px;">
          Lekhok Tripura Cafe &amp; Library • Where Words Meet Coffee
        </div>
      </div>
    `;

    const result = await sendEmail({
      to: order.customerEmail,
      subject: `📄 Cafe Order Invoice #${order.orderNumber} - Lekhok Tripura`,
      html: htmlContent,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: "application/pdf"
        }
      ]
    });

    console.log(`[Cafe Bill Email Sent]: Sent invoice PDF to ${order.customerEmail}`);
    return result;
  } catch (err) {
    console.error("[Cafe Bill Email Error]:", err.message);
    return false;
  }
}

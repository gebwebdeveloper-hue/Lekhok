import crypto from "crypto";
import Razorpay from "razorpay";
import { CafeOrder } from "../models/CafeOrder.js";
import { env } from "../../config/env.js";
import { generateCafeInvoicePdfBuffer, sendCafeBillEmailWithPdf } from "../../services/cafeInvoicePdf.service.js";

function getRazorpayInstance() {
  const keyId = env.razorpayKeyId;
  const keySecret = env.razorpayKeySecret;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured.");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

function generateOrderNumber() {
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  return `LTC-${randomNum}`;
}

// ── 1. Create Razorpay Order ──────────────────────────────────────────────
export async function createRazorpayOrder(req, res, next) {
  try {
    const { items, customerPhone } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart items are required." });
    }

    // Calculate total amount
    let totalAmount = 0;
    const processedItems = items.map((item) => {
      const price = Number(item.price) || 0;
      const qty = Math.max(1, Number(item.quantity) || 1);
      totalAmount += price * qty;
      return {
        menuItemId: item._id || item.menuItemId,
        name: item.name,
        price,
        quantity: qty,
        category: item.category || "others",
        imageUrl: item.imageUrl || "",
      };
    });

    if (totalAmount <= 0) {
      return res.status(400).json({ success: false, message: "Total order amount must be greater than 0." });
    }

    const razorpay = getRazorpayInstance();
    const amountInPaise = Math.round(totalAmount * 100);

    // Create Razorpay Order
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    });

    const orderNumber = generateOrderNumber();

    // Create draft Order in database
    const newOrder = await CafeOrder.create({
      orderNumber,
      userId: req.user._id.toString(),
      customerName: req.user.name || "Customer",
      customerEmail: req.user.email || "",
      customerPhone: customerPhone || req.user.phone || "",
      items: processedItems,
      totalAmount,
      paymentStatus: "pending",
      paymentMethod: "razorpay",
      razorpayOrderId: razorpayOrder.id,
      status: "New Order",
      statusHistory: [{ status: "New Order", updatedAt: new Date(), note: "Order placed, awaiting payment confirmation" }],
    });

    res.status(201).json({
      success: true,
      keyId: env.razorpayKeyId,
      razorpayOrderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: "INR",
      orderId: newOrder._id,
      orderNumber: newOrder.orderNumber,
    });
  } catch (err) {
    next(err);
  }
}

// ── 2. Verify Razorpay Payment ────────────────────────────────────────────
export async function verifyPayment(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Razorpay payment details are missing." });
    }

    const keySecret = env.razorpayKeySecret;
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto.createHmac("sha256", keySecret).update(body).digest("hex");

    if (expectedSignature !== razorpay_signature) {
      // Mark as failed if signature mismatch
      if (orderId) {
        await CafeOrder.findByIdAndUpdate(orderId, { paymentStatus: "failed" });
      }
      return res.status(400).json({ success: false, message: "Invalid payment signature verification failed." });
    }

    // Find and update order
    const order = await CafeOrder.findOne({
      $or: [{ _id: orderId }, { razorpayOrderId: razorpay_order_id }],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    order.paymentStatus = "paid";
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.status = "New Order";
    order.statusHistory.push({ status: "New Order", updatedAt: new Date(), note: "Payment verified via Razorpay" });

    await order.save();

    res.json({
      success: true,
      message: "Payment verified successfully! Your order has been placed.",
      order,
    });
  } catch (err) {
    next(err);
  }
}

// ── 3. Customer: My Orders ────────────────────────────────────────────────
export async function getMyOrders(req, res, next) {
  try {
    const orders = await CafeOrder.find({ userId: req.user._id.toString() })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
}

// ── 4. Customer: Live Order Status ─────────────────────────────────────────
export async function getLiveOrderStatus(req, res, next) {
  try {
    const order = await CafeOrder.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
}

// ── 5. Admin: Get All Orders ──────────────────────────────────────────────
export async function getAdminOrders(req, res, next) {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== "all") filter.status = status;

    const orders = await CafeOrder.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
}

// ── 6. Admin: Update Order Status ─────────────────────────────────────────
export async function updateOrderStatus(req, res, next) {
  try {
    const { status, note } = req.body;
    const allowedStatuses = ["New Order", "Accepted", "Confirmed", "Preparing", "Ready", "Collected"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${allowedStatuses.join(", ")}` });
    }

    const order = await CafeOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });

    order.status = status;
    order.statusHistory.push({
      status,
      updatedAt: new Date(),
      note: note || `Status updated to ${status} by admin`,
    });

    if (status === "Ready") {
      order.customerNotified = true;
    }

    if (status === "Collected") {
      // Trigger automated email with attached PDF invoice asynchronously
      sendCafeBillEmailWithPdf(order).catch((err) =>
        console.error("[Bill Email Send Fail]:", err.message)
      );
    }

    await order.save();

    res.json({
      success: true,
      message: status === "Ready"
        ? "Order marked as Ready! Customer notified to collect meal from counter."
        : status === "Collected"
        ? "Order marked as Collected! PDF bill receipt sent to customer's email."
        : `Order status updated to ${status}.`,
      order,
    });
  } catch (err) {
    next(err);
  }
}

// ── 7. Download PDF Invoice Receipt ────────────────────────────────────────
export async function downloadOrderInvoicePdf(req, res, next) {
  try {
    const order = await CafeOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });

    const pdfBuffer = await generateCafeInvoicePdfBuffer(order);
    const fileName = `Lekhok_Tripura_Invoice_${order.orderNumber || order._id}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

import crypto from "crypto";
import Razorpay from "razorpay";
import { env } from "../../config/env.js";
import { CafeSpaceBooking } from "../models/CafeSpaceBooking.js";

const razorpay = new Razorpay({
  key_id: env.razorpayKeyId,
  key_secret: env.razorpayKeySecret,
});

// All available time slots in a day
export const ALL_TIME_SLOTS = [
  "09:00 AM - 11:00 AM",
  "11:00 AM - 01:00 PM",
  "01:00 PM - 03:00 PM",
  "03:00 PM - 05:00 PM",
  "05:00 PM - 07:00 PM",
  "07:00 PM - 09:00 PM",
];

// GET /api/cafe/space/availability?date=YYYY-MM-DD&spaceType=...
export async function getSpaceAvailability(req, res, next) {
  try {
    const { date, spaceType } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: "Date is required (YYYY-MM-DD)" });
    }

    const filter = { bookingDate: date, status: { $ne: "Cancelled" } };
    if (spaceType) filter.spaceType = spaceType;

    const existingBookings = await CafeSpaceBooking.find(filter).lean();
    const bookedSlots = existingBookings.map((b) => b.timeSlot);

    const slotStatus = ALL_TIME_SLOTS.map((slot) => ({
      slot,
      available: !bookedSlots.includes(slot),
    }));

    res.json({
      success: true,
      date,
      spaceType: spaceType || "All",
      slots: slotStatus,
      totalBookings: existingBookings.length,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/cafe/space/create-booking-order  (auth required)
export async function createSpaceBookingOrder(req, res, next) {
  try {
    const { spaceType, bookingDate, timeSlot, durationHours, guestsCount, purpose, amount } = req.body;

    if (!spaceType || !bookingDate || !timeSlot) {
      return res.status(400).json({ success: false, message: "Space type, date, and time slot are required." });
    }

    // Check if slot is already booked for this spaceType
    const existing = await CafeSpaceBooking.findOne({
      spaceType,
      bookingDate,
      timeSlot,
      status: { $ne: "Cancelled" },
    });

    if (existing) {
      return res.status(400).json({ success: false, message: "This time slot is already booked. Please select another slot." });
    }

    const totalAmount = amount || (durationHours ? durationHours * 49 : 99);
    const bookingNumber = `RWS-${Math.floor(10000 + Math.random() * 90000)}`;

    const options = {
      amount: Math.round(totalAmount * 100),
      currency: "INR",
      receipt: `rcpt_${bookingNumber}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    const newBooking = new CafeSpaceBooking({
      bookingNumber,
      userId: req.user?._id?.toString() || "guest",
      customerName: req.user?.name || req.body.customerName || "Reader Guest",
      customerEmail: req.user?.email || req.body.customerEmail || "",
      customerPhone: req.body.customerPhone || req.user?.phone || "",
      spaceType,
      bookingDate,
      timeSlot,
      durationHours: durationHours || 2,
      guestsCount: guestsCount || 1,
      purpose: purpose || "Reading & Studying",
      totalAmount,
      paymentStatus: "pending",
      razorpayOrderId: razorpayOrder.id,
    });

    await newBooking.save();

    res.json({
      success: true,
      booking: newBooking,
      razorpayOrder: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: env.razorpayKeyId,
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/cafe/space/verify-booking-payment  (auth required)
export async function verifySpaceBookingPayment(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;

    const generated_signature = crypto
      .createHmac("sha256", env.razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature." });
    }

    const booking = await CafeSpaceBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking record not found." });
    }

    booking.paymentStatus = "paid";
    booking.status = "Confirmed";
    booking.razorpayPaymentId = razorpay_payment_id;
    booking.razorpaySignature = razorpay_signature;
    await booking.save();

    res.json({
      success: true,
      message: "Slot reserved successfully! Enjoy your time at Lekhok Tripura Readers & Writers Space.",
      booking,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/cafe/space/my-bookings  (auth required)
export async function getMySpaceBookings(req, res, next) {
  try {
    const userId = req.user?._id?.toString();
    const bookings = await CafeSpaceBooking.find({ userId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, bookings });
  } catch (err) {
    next(err);
  }
}

// GET /api/cafe/space/admin/all  (admin required)
export async function getAdminSpaceBookings(req, res, next) {
  try {
    const bookings = await CafeSpaceBooking.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, bookings });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/cafe/space/admin/:id/status  (admin required)
export async function updateSpaceBookingStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const booking = await CafeSpaceBooking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found." });
    }

    booking.status = status;
    await booking.save();

    res.json({ success: true, message: `Booking status updated to ${status}`, booking });
  } catch (err) {
    next(err);
  }
}

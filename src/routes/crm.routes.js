import { Router } from "express";
import { User } from "../models/User.js";
import { PurchaseRequest } from "../models/PurchaseRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Seed initial users if database collection is empty
const defaultSeedUsers = [
  {
    name: "Subhajit Roy",
    email: "subhajit.roy@example.com",
    phone: "9862123456",
    co: "Madhuban",
    district: "West Tripura",
    country: "India",
    role: "user",
    sentiment: "Positive",
    paymentStatus: "Paid",
    paymentAmount: 450,
    followUpCount: 2,
    crmNotes: "Interested in new historical book releases. Prefers WhatsApp notifications.",
    followUpLogs: [
      {
        date: new Date("2026-08-10"),
        note: "Initial introductory call. Expressed strong interest in Tripura history publications.",
        adminName: "Admin Subho",
        status: "Call Completed",
        sentiment: "Positive",
        paymentStatus: "Pending"
      },
      {
        date: new Date("2026-08-15"),
        note: "Confirmed purchase via UPI. Payment received cleanly.",
        adminName: "Admin Subho",
        status: "Payment Received",
        sentiment: "Positive",
        paymentStatus: "Paid"
      }
    ]
  },
  {
    name: "Priya Deb",
    email: "priya.deb@example.com",
    phone: "7005123456",
    co: "Kailashahar",
    district: "Unakoti",
    country: "India",
    role: "user",
    sentiment: "Hot Lead",
    paymentStatus: "Pending",
    paymentAmount: 935,
    followUpCount: 1,
    crmNotes: "Inquired about Poetry Anthology volume 2. Callback scheduled.",
    followUpLogs: [
      {
        date: new Date("2026-08-17"),
        note: "Sent soft invoice quote. Waiting for Google Pay payment confirmation.",
        adminName: "Admin",
        status: "Invoice Sent",
        sentiment: "Hot Lead",
        paymentStatus: "Pending"
      }
    ]
  },
  {
    name: "Dr. Anirban Das",
    email: "anirban.das@gmail.com",
    phone: "9436123456",
    co: "Battala",
    district: "West Tripura",
    country: "India",
    role: "user",
    sentiment: "Positive",
    paymentStatus: "Paid",
    paymentAmount: 9100,
    followUpCount: 3,
    crmNotes: "Bulk printing order customer. Highly satisfied author.",
    followUpLogs: [
      {
        date: new Date("2026-08-12"),
        note: "Discussed book printing layout & page count. Agreed on 50 copies.",
        adminName: "Admin",
        status: "Meeting Done",
        sentiment: "Positive",
        paymentStatus: "Paid"
      }
    ]
  },
  {
    name: "Smt. Ratna Roy",
    email: "ratna.roy@example.com",
    phone: "9862987654",
    co: "Dharmanagar",
    district: "North Tripura",
    country: "India",
    role: "user",
    sentiment: "Negative",
    paymentStatus: "Pending",
    paymentAmount: 0,
    followUpCount: 2,
    crmNotes: "Not interested at current price point. Requested discount.",
    followUpLogs: [
      {
        date: new Date("2026-08-14"),
        note: "Customer cited price was high. Offered seasonal 10% coupon code.",
        adminName: "Admin",
        status: "Negotiation",
        sentiment: "Negative",
        paymentStatus: "Pending"
      }
    ]
  }
];

// GET /api/crm/users - List all users / leads with CRM data & purchases
router.get(
  "/users",
  asyncHandler(async (_req, res) => {
    let users = await User.find().sort({ createdAt: -1 }).lean();

    if (!users || users.length === 0) {
      console.log("Seeding default CRM users into MongoDB...");
      await User.insertMany(defaultSeedUsers);
      users = await User.find().sort({ createdAt: -1 }).lean();
    }

    // Fetch purchase requests to enrich user spent data
    const purchases = await PurchaseRequest.find().lean();
    const purchaseMap = {};
    purchases.forEach((p) => {
      if (!p.userId) return;
      const uId = typeof p.userId === "object" ? p.userId._id.toString() : p.userId.toString();
      if (!purchaseMap[uId]) purchaseMap[uId] = { count: 0, totalSpent: 0 };
      if (p.status === "approved") {
        purchaseMap[uId].count += 1;
        purchaseMap[uId].totalSpent += Number(p.amount || 0);
      }
    });

    const enriched = users.map((u) => {
      const uId = u._id.toString();
      const pData = purchaseMap[uId] || { count: 0, totalSpent: 0 };
      return {
        ...u,
        id: uId,
        totalBooksBought: pData.count,
        totalSpent: pData.totalSpent > 0 ? pData.totalSpent : (u.paymentAmount || 0)
      };
    });

    res.json({ success: true, count: enriched.length, users: enriched });
  })
);

// POST /api/crm/users - Create new lead / user manually
router.post(
  "/users",
  asyncHandler(async (req, res) => {
    const {
      name, email, phone, co, district, country, sentiment, paymentStatus, paymentAmount, crmNotes
    } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required to create a lead." });
    }

    let existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      // Update existing
      existing.name = name || existing.name;
      existing.phone = phone || existing.phone;
      existing.co = co || existing.co;
      existing.district = district || existing.district;
      existing.sentiment = sentiment || existing.sentiment;
      existing.paymentStatus = paymentStatus || existing.paymentStatus;
      if (paymentAmount !== undefined) existing.paymentAmount = Number(paymentAmount);
      if (crmNotes !== undefined) existing.crmNotes = crmNotes;
      await existing.save();
      return res.json({ success: true, message: "Lead details updated successfully.", user: existing });
    }

    const newUser = await User.create({
      name: name || "Lead Customer",
      email: email.toLowerCase().trim(),
      phone: phone || "",
      co: co || "",
      district: district || "Tripura",
      country: country || "India",
      sentiment: sentiment || "Neutral",
      paymentStatus: paymentStatus || "Pending",
      paymentAmount: Number(paymentAmount) || 0,
      crmNotes: crmNotes || "",
      followUpCount: 0,
      followUpLogs: []
    });

    res.status(201).json({ success: true, message: "New lead created successfully.", user: newUser });
  })
);

// PUT /api/crm/users/:id - Edit user details & CRM attributes
router.put(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    let user = await User.findById(id);
    if (!user) {
      user = await User.findOne({ email: updateData.email });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found in MongoDB." });
    }

    if (updateData.name !== undefined) user.name = updateData.name;
    if (updateData.email !== undefined) user.email = updateData.email;
    if (updateData.phone !== undefined) user.phone = updateData.phone;
    if (updateData.co !== undefined) user.co = updateData.co;
    if (updateData.district !== undefined) user.district = updateData.district;
    if (updateData.sentiment !== undefined) user.sentiment = updateData.sentiment;
    if (updateData.paymentStatus !== undefined) user.paymentStatus = updateData.paymentStatus;
    if (updateData.paymentAmount !== undefined) user.paymentAmount = Number(updateData.paymentAmount);
    if (updateData.crmNotes !== undefined) user.crmNotes = updateData.crmNotes;
    if (updateData.nextFollowUpDate !== undefined) user.nextFollowUpDate = updateData.nextFollowUpDate;

    await user.save();
    res.json({ success: true, message: "User CRM details updated successfully.", user });
  })
);

// POST /api/crm/users/:id/follow-up - Log follow-up call / message
router.post(
  "/users/:id/follow-up",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { note, adminName, status, sentiment, paymentStatus, paymentAmount, nextFollowUpDate } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User record not found." });
    }

    const logEntry = {
      date: new Date(),
      note: note || "Follow-up completed.",
      adminName: adminName || "Admin",
      status: status || "Call Completed",
      sentiment: sentiment || user.sentiment,
      paymentStatus: paymentStatus || user.paymentStatus
    };

    user.followUpLogs.unshift(logEntry);
    user.followUpCount = (user.followUpCount || 0) + 1;
    user.lastFollowUpAt = new Date();

    if (sentiment) user.sentiment = sentiment;
    if (paymentStatus) user.paymentStatus = paymentStatus;
    if (paymentAmount !== undefined) user.paymentAmount = Number(paymentAmount);
    if (nextFollowUpDate) user.nextFollowUpDate = nextFollowUpDate;
    if (note) {
      user.crmNotes = note;
    }

    await user.save();
    res.json({ success: true, message: "Follow-up logged successfully.", user });
  })
);

// DELETE /api/crm/users/:id - Delete lead / user
router.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    res.json({ success: true, message: "User record deleted successfully." });
  })
);

export default router;

import express from "express";
import { Invoice } from "../models/Invoice.js";
import { Expense } from "../models/Expense.js";

const router = express.Router();

const INITIAL_INCOME_RECORDS = [
  {
    slNo: 1,
    year: "2026",
    month: "AUG",
    invoiceNo: "LT/TR/26-27/0001",
    date: "12 Aug 2026",
    paymentMode: "Google Pay",
    customerName: "Dr. Anirban Das",
    customerPhone: "9436123456",
    customerEmail: "anirban.das@gmail.com",
    customerAddress: "Battala, Agartala, West Tripura",
    description: "Publishing & Book Printing Services",
    qty: 50,
    actualRate: 150,
    taxablePayable: 7500,
    gstAmount: 1350,
    deliveryCharges: 250,
    courierName: "SpeedPost",
    discount: 0,
    totalAmount: 9100,
    billLink: ""
  },
  {
    slNo: 2,
    year: "2026",
    month: "AUG",
    invoiceNo: "LT/TR/26-27/0002",
    date: "14 Aug 2026",
    paymentMode: "PhonePe",
    customerName: "Smt. Ratna Roy",
    customerPhone: "9862987654",
    customerEmail: "ratna.roy@yahoo.com",
    customerAddress: "Dharmanagar, North Tripura",
    description: "Editorial & Layout Design",
    qty: 1,
    actualRate: 3000,
    taxablePayable: 3000,
    gstAmount: 540,
    deliveryCharges: 0,
    courierName: "Email Delivery",
    discount: 200,
    totalAmount: 3340,
    billLink: ""
  },
  {
    slNo: 3,
    year: "2026",
    month: "AUG",
    invoiceNo: "LT/TR/26-27/0003",
    date: "15 Aug 2026",
    paymentMode: "Bank Transfer",
    customerName: "Tripura Sahitya Parisad",
    customerPhone: "03812345678",
    customerEmail: "contact@tripurasahitya.org",
    customerAddress: "Agartala Club Road, Agartala",
    description: "Souvenir Journal Publication",
    qty: 100,
    actualRate: 120,
    taxablePayable: 12000,
    gstAmount: 2160,
    deliveryCharges: 500,
    courierName: "Local Van",
    discount: 500,
    totalAmount: 14160,
    billLink: ""
  },
  {
    slNo: 4,
    year: "2026",
    month: "AUG",
    invoiceNo: "LT/TR/26-27/0004",
    date: "17 Aug 2026",
    paymentMode: "UPI",
    customerName: "Priya Deb",
    customerPhone: "7005123456",
    customerEmail: "priya@example.com",
    customerAddress: "Kailashahar, Unakoti",
    description: "Tripura Poetry Anthology",
    qty: 3,
    actualRate: 250,
    taxablePayable: 750,
    gstAmount: 135,
    deliveryCharges: 50,
    courierName: "BlueDart",
    discount: 0,
    totalAmount: 935,
    billLink: ""
  },
  {
    slNo: 5,
    year: "2026",
    month: "AUG",
    invoiceNo: "LT/TR/26-27/0005",
    date: "18 Aug 2026",
    paymentMode: "Google Pay",
    customerName: "Kiran Samanta",
    customerPhone: "8794123456",
    customerEmail: "kiransamanta88@gmail.com",
    customerAddress: "Madhuban, Agartala",
    description: "Publishing & Printing Services",
    qty: 1,
    actualRate: 400,
    taxablePayable: 400,
    gstAmount: 72,
    deliveryCharges: 40,
    courierName: "Local Delivery",
    discount: 0,
    totalAmount: 512,
    billLink: ""
  }
];

const INITIAL_EXPENSE_RECORDS = [
  {
    invoiceNo: "EXP/2026/001",
    gstBill: "YES",
    itemName: "Book Printing Paper Roll 80GSM",
    purpose: "Publication Printing",
    year: "2026",
    month: "AUG",
    date: "10 Aug 2026",
    partyName: "Agartala Print House",
    partyNumber: "9862000000",
    partyEmail: "print@agartala.com",
    partyAddress: "Battala, Agartala",
    gstRate: 18,
    gstAmount: 360,
    beforeTaxAmount: 2000,
    totalBillAmount: 2360,
    billLink: "https://www.lekhoktripura.in/"
  },
  {
    invoiceNo: "EXP/2026/002",
    gstBill: "NO",
    itemName: "Office Tea & Snacks",
    purpose: "Office Maintenance",
    year: "2026",
    month: "AUG",
    date: "12 Aug 2026",
    partyName: "Local Market Store",
    partyNumber: "9436000000",
    partyEmail: "",
    partyAddress: "Madhuban Bazaar",
    gstRate: 0,
    gstAmount: 0,
    beforeTaxAmount: 450,
    totalBillAmount: 450,
    billLink: "#"
  }
];

// ── INVOICES / INCOME ROUTES ──

// GET all invoices from MongoDB (seeds initial default invoices if collection empty)
router.get("/invoices", async (_req, res) => {
  try {
    let invoices = await Invoice.find({}).sort({ createdAt: -1 }).lean();
    if (invoices.length === 0) {
      await Invoice.insertMany(INITIAL_INCOME_RECORDS);
      invoices = await Invoice.find({}).sort({ createdAt: -1 }).lean();
    }
    const formatted = invoices.map((inv) => ({
      ...inv,
      id: inv._id.toString()
    }));
    return res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST save or update an invoice in MongoDB (Upsert by invoiceNo or _id)
router.post("/invoices", async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.invoiceNo) {
      return res.status(400).json({ success: false, message: "Invoice number is required." });
    }

    let invoice;
    if (payload.id || payload._id) {
      const targetId = payload.id || payload._id;
      invoice = await Invoice.findByIdAndUpdate(targetId, payload, { new: true, upsert: true });
    } else {
      invoice = await Invoice.findOneAndUpdate(
        { invoiceNo: payload.invoiceNo },
        payload,
        { new: true, upsert: true }
      );
    }

    return res.json({
      success: true,
      message: "Invoice saved to database successfully.",
      data: {
        ...invoice.toObject(),
        id: invoice._id.toString()
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update invoice by ID in MongoDB
router.put("/invoices/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findByIdAndUpdate(id, req.body, { new: true });
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found." });
    }
    return res.json({
      success: true,
      message: "Invoice updated in database successfully.",
      data: {
        ...invoice.toObject(),
        id: invoice._id.toString()
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE invoice from MongoDB
router.delete("/invoices/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Invoice.findByIdAndDelete(id);
    if (!deleted) {
      // Fallback try invoiceNo delete if Mongo ObjectId mismatch
      await Invoice.findOneAndDelete({ invoiceNo: id });
    }
    return res.json({ success: true, message: "Invoice deleted from database." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ── EXPENSE ROUTES ──

// GET all expenses from MongoDB (seeds initial default expenses if collection empty)
router.get("/expenses", async (_req, res) => {
  try {
    let expenses = await Expense.find({}).sort({ createdAt: -1 }).lean();
    if (expenses.length === 0) {
      await Expense.insertMany(INITIAL_EXPENSE_RECORDS);
      expenses = await Expense.find({}).sort({ createdAt: -1 }).lean();
    }
    const formatted = expenses.map((exp) => ({
      ...exp,
      id: exp._id.toString()
    }));
    return res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST create/upsert expense in MongoDB
router.post("/expenses", async (req, res) => {
  try {
    const payload = req.body;
    let expense;
    if (payload.id || payload._id) {
      const targetId = payload.id || payload._id;
      expense = await Expense.findByIdAndUpdate(targetId, payload, { new: true, upsert: true });
    } else {
      expense = await Expense.create(payload);
    }
    return res.json({
      success: true,
      message: "Expense saved to database successfully.",
      data: {
        ...expense.toObject(),
        id: expense._id.toString()
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update expense by ID in MongoDB
router.put("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findByIdAndUpdate(id, req.body, { new: true });
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found." });
    }
    return res.json({
      success: true,
      message: "Expense updated in database successfully.",
      data: {
        ...expense.toObject(),
        id: expense._id.toString()
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE expense from MongoDB
router.delete("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Expense.findByIdAndDelete(id);
    if (!deleted) {
      await Expense.findOneAndDelete({ invoiceNo: id });
    }
    return res.json({ success: true, message: "Expense deleted from database." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

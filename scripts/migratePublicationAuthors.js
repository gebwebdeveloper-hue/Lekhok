import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { env } from "../src/config/env.js";
import { Author } from "../src/models/Author.js";
import { generateAuthorPassword } from "../src/utils/authorAuth.js";

async function runStrictPublicationMigration() {
  console.log("=================================================");
  console.log("🧹 FILTERING & MIGRATING ONLY PUBLICATION AUTHORS");
  console.log("=================================================");

  await mongoose.connect(env.mongoUri);

  const authorDbConn = mongoose.createConnection();
  await authorDbConn.openUri(env.authorMongoUri);

  const authorPortalUserSchema = new mongoose.Schema(
    {
      authorId: { type: String, unique: true, index: true },
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
      phone: { type: String, required: true, trim: true },
      passwordHash: { type: String, required: true, select: false },
      role: { type: String, default: "author", index: true },
      selectedPlan: { type: String, default: "Publication Author Plan" },
      planDetails: { type: String, default: "Official Publication Author" },
      publishingPaymentStatus: { type: String, enum: ["PENDING", "PAID"], default: "PAID" },
      invoiceUrl: { type: String, default: "" },
      planAmount: { type: Number, default: 0 },
      amountPaid: { type: Number, default: 0 },
      paymentMethod: { type: String, default: "UPI" },
      workflowSteps: { type: Array, default: [] },
      books: { type: Array, default: [] },
      paidAmount: { type: Number, default: 0 },
      pendingAmount: { type: Number, default: 0 },
      netAuthorProfit: { type: Number, default: 0 },
      totalDeduction: { type: Number, default: 0 },
      royaltyPaymentStatus: { type: String, default: "PENDING" }
    },
    { timestamps: true }
  );

  const AuthorPortalUserModel = authorDbConn.model("AuthorPortalUser", authorPortalUserSchema);

  // 1. Fetch strictly authors where ourPublicationAuthor is true
  const pubAuthors = await Author.find({ ourPublicationAuthor: true });
  console.log(`Found ${pubAuthors.length} strict publication authors in Main DB.`);

  const pubNames = pubAuthors.map((a) => a.name);

  // 2. Remove any auto-migrated authors from AuthorPortalUser who are NOT publication authors and weren't registered manually via form
  const allPortalUsers = await AuthorPortalUserModel.find({ selectedPlan: "Publication Author Plan" });
  for (const pUser of allPortalUsers) {
    if (!pubNames.includes(pUser.name)) {
      console.log(`🗑️ Removing non-publication author from portal: ${pUser.name}`);
      await AuthorPortalUserModel.findByIdAndDelete(pUser._id);
    }
  }

  // 3. Upsert strict publication authors
  let migratedCount = 0;

  for (const mAuth of pubAuthors) {
    if (!mAuth.name) continue;

    const cleanEmail = `${mAuth.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}@lekhoktripura.in`;
    const defaultPhone = "9876543210";
    const rawPassword = generateAuthorPassword(mAuth.name, defaultPhone);
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const defaultWorkflow = [
      { stepNumber: 1, name: "Payment", status: "COMPLETED" },
      { stepNumber: 2, name: "ISBN Generated", status: "COMPLETED" },
      { stepNumber: 3, name: "Book Page", status: "COMPLETED" },
      { stepNumber: 4, name: "Book Cover", status: "COMPLETED" },
      { stepNumber: 5, name: "Formatting", status: "COMPLETED" },
      { stepNumber: 6, name: "Author Approval", status: "COMPLETED" },
      { stepNumber: 7, name: "Ready to Print", status: "COMPLETED" },
      { stepNumber: 8, name: "Printing", status: "COMPLETED" },
      { stepNumber: 9, name: "Stock Ready", status: "COMPLETED" }
    ];

    await AuthorPortalUserModel.findOneAndUpdate(
      { $or: [{ name: mAuth.name }, { email: cleanEmail }] },
      {
        $setOnInsert: {
          authorId: `a${mAuth._id}`,
          name: mAuth.name,
          email: cleanEmail,
          phone: defaultPhone,
          passwordHash,
          role: "author",
          selectedPlan: "Publication Author Plan",
          planDetails: mAuth.bio || "Official Publication Author",
          publishingPaymentStatus: "PAID",
          planAmount: 0,
          amountPaid: 0,
          paymentMethod: "UPI",
          workflowSteps: defaultWorkflow,
          books: [
            {
              title: `${mAuth.name} - Published Works`,
              isbn: "—",
              copiesPrinted: 50,
              copiesSold: 0,
              currentStock: 50,
              stockStatus: "IN STOCK"
            }
          ]
        }
      },
      { upsert: true, new: true }
    );

    console.log(`✓ Strict Publication Author: ${mAuth.name} (${cleanEmail}) - Password: ${rawPassword}`);
    migratedCount++;
  }

  console.log(`\n🎉 Completed! Strictly ${migratedCount} Publication Authors remain in Publisher DB.`);
  await mongoose.disconnect();
  await authorDbConn.close();
  process.exit(0);
}

runStrictPublicationMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

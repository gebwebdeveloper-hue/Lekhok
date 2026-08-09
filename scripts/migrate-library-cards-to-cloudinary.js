/**
 * Migration Script: Re-generate and upload all library card PDFs
 * that are currently stored as local paths (/uploads/...) to Cloudinary,
 * then update their pdfUrl in MongoDB.
 *
 * Run with:  node scripts/migrate-library-cards-to-cloudinary.js
 */

import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { LibraryCard } from "../src/models/LibraryCard.js";
import { generateLibraryCardPdf } from "../src/services/libraryCardPdf.service.js";

// Connect to MongoDB
await mongoose.connect(env.mongoUri);
console.log("✅ Connected to MongoDB");

// Find all cards with local (non-http) pdfUrl
const localCards = await LibraryCard.find({
  pdfUrl: { $not: /^https?:\/\// },
});

if (localCards.length === 0) {
  console.log("✅ No local-path cards found. All cards already use Cloudinary URLs.");
  await mongoose.disconnect();
  process.exit(0);
}

console.log(`\n📋 Found ${localCards.length} card(s) with local pdfUrl. Starting migration...\n`);

let successCount = 0;
let failCount = 0;

for (const card of localCards) {
  console.log(`  → Processing ${card.cardId}  (current url: ${card.pdfUrl})`);
  try {
    const pdfResult = await generateLibraryCardPdf({
      cardId:           card.cardId,
      userName:         card.userName,
      userEmail:        card.userEmail,
      userPhone:        card.userPhone,
      dob:              card.dob || "",
      fatherName:       card.fatherName || "",
      state:            card.state || "Tripura",
      district:         card.district || "",
      villageTown:      card.villageTown || "",
      postOffice:       card.postOffice || "",
      pinCode:          card.pinCode || "",
      policeStation:    card.policeStation || "",
      emergencyContact: card.emergencyContact || "",
      issuedAt:         card.issuedAt,
      validUntil:       card.validUntil,
    });

    await LibraryCard.findByIdAndUpdate(card._id, { pdfUrl: pdfResult.url });
    console.log(`     ✅ Uploaded to Cloudinary: ${pdfResult.url}`);
    successCount++;
  } catch (err) {
    console.error(`     ❌ Failed for ${card.cardId}:`, err.message);
    failCount++;
  }
}

console.log(`\n📊 Migration complete:  ${successCount} succeeded,  ${failCount} failed`);
await mongoose.disconnect();
process.exit(failCount > 0 ? 1 : 0);

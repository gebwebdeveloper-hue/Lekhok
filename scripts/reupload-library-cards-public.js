/**
 * Force re-upload ALL library card PDFs to Cloudinary with type:"upload" (public).
 * Run with:  node scripts/reupload-library-cards-public.js
 */

import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { LibraryCard } from "../src/models/LibraryCard.js";
import { generateLibraryCardPdf } from "../src/services/libraryCardPdf.service.js";

await mongoose.connect(env.mongoUri);
console.log("✅ Connected to MongoDB");

const allCards = await LibraryCard.find({});

if (allCards.length === 0) {
  console.log("No cards found.");
  await mongoose.disconnect();
  process.exit(0);
}

console.log(`\n📋 Re-uploading ${allCards.length} card(s) as PUBLIC to Cloudinary...\n`);

let success = 0, fail = 0;

for (const card of allCards) {
  console.log(`  → ${card.cardId}  (current url: ${card.pdfUrl})`);
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
    console.log(`     ✅ ${pdfResult.url}`);
    success++;
  } catch (err) {
    console.error(`     ❌ Failed: ${err.message}`);
    fail++;
  }
}

console.log(`\n📊 Done:  ${success} succeeded,  ${fail} failed`);
await mongoose.disconnect();
process.exit(fail > 0 ? 1 : 0);

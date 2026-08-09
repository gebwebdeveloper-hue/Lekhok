import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import ClubMember from "../src/models/ClubMember.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

async function fixClubMemberIds() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("No MongoDB URI found in environment.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  console.log("MongoDB connected successfully.");

  // Find all members with empty string or missing memberId
  const members = await ClubMember.find({
    $or: [
      { memberId: "" },
      { memberId: { $exists: false } },
      { memberId: null }
    ]
  });

  console.log(`Found ${members.length} members with missing/empty memberId.`);

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    let attempts = 0;
    let newMemberId = "";
    while (attempts < 20) {
      const num = Math.floor(1000 + Math.random() * 9000);
      newMemberId = `LTCLUB-${num}`;
      const exists = await ClubMember.exists({ memberId: newMemberId });
      if (!exists) break;
      attempts++;
    }

    if (!newMemberId) {
      newMemberId = `LTCLUB-${Date.now().toString().slice(-4)}`;
    }

    member.memberId = newMemberId;
    await member.save();
    console.log(`Updated member ${member.fullName} (${member.email}) -> memberId: ${newMemberId}`);
  }

  // Drop conflicting index if needed and sync indexes
  try {
    await ClubMember.collection.dropIndex("memberId_1");
    console.log("Dropped old memberId_1 index.");
  } catch (err) {
    console.log("Index drop note:", err.message);
  }

  await ClubMember.syncIndexes();
  console.log("ClubMember indexes synced successfully.");

  process.exit(0);
}

fixClubMemberIds().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});

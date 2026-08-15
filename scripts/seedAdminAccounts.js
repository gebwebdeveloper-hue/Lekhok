import bcrypt from "bcryptjs";
import { connectDatabase } from "../src/config/database.js";
import { User } from "../src/models/User.js";

const ADMIN_ACCOUNTS = [
  { email: "lekhok.tripura@gmail.com", pass: "Lekhok@00", name: "Lekhok Tripura Admin" },
  { email: "lekhoktripura.website@gmail.com", pass: "@Lekhoktripura@1991@", name: "Website Admin" },
  { email: "lekhoktripura.publishers@gmail.com", pass: "Lekhok@00", name: "Publishers Admin" },
  { email: "helpdesk.lekhoktripura@gmail.com", pass: "Lekhok@2025", name: "Helpdesk Admin" },
  { email: "lekhoktripura.cafe@gmail.com", pass: "Lekhok@00", name: "Cafe Admin" },
  { email: "lekhoktripurapublishers@outlook.com", pass: "Lekhok@00", name: "Outlook Admin" },
  { email: "lekhoktripurapublishers@yahoo.com", pass: "Lekhoktripura@2025", name: "Yahoo Admin" }
];

async function seedAdminAccounts() {
  try {
    console.log("[SeedAdmin] Connecting to databases...");
    await connectDatabase();

    for (const acc of ADMIN_ACCOUNTS) {
      const normalizedEmail = acc.email.trim().toLowerCase();
      const passwordHash = await bcrypt.hash(acc.pass, 10);

      let user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");

      if (!user) {
        user = new User({
          email: normalizedEmail,
          name: acc.name,
          role: "admin",
          verified: true,
          passwordHash
        });
        await user.save();
        console.log(`[SeedAdmin] Created new admin user: ${normalizedEmail}`);
      } else {
        user.name = acc.name || user.name;
        user.role = "admin";
        user.verified = true;
        user.passwordHash = passwordHash;
        await user.save();
        console.log(`[SeedAdmin] Updated existing admin user to role 'admin': ${normalizedEmail}`);
      }
    }

    console.log("[SeedAdmin] All 7 admin accounts seeded successfully!");
    process.exit(0);
  } catch (err) {
    console.error("[SeedAdmin] Error seeding admin accounts:", err);
    process.exit(1);
  }
}

seedAdminAccounts();

import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import bcrypt from "bcryptjs";
import { User } from "./models/User.js";

async function bootstrap() {
  try {
    await connectDatabase();

    // Seed / Ensure Admin User exists with correct credentials
    const adminEmail = "lekhok.tripura@gmail.com";
    const adminPassword = "Lekhok@2025";
    
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await User.create({
        email: adminEmail,
        passwordHash,
        role: "admin",
        verified: true,
        name: "Lekhak Tripura Admin"
      });
      console.log(`[Seed] Created admin account: ${adminEmail}`);
    } else {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      existingAdmin.role = "admin";
      existingAdmin.passwordHash = passwordHash;
      await existingAdmin.save();
      console.log(`[Seed] Verified and updated admin credentials: ${adminEmail}`);
    }

    app.listen(env.port, () => {
      console.log(`LEKHAK API running on port ${env.port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

bootstrap();
import bcrypt from "bcryptjs";
import { AuthorPortalUser } from "../models/AuthorPortalUser.js";
import { sendAuthorCredentialsEmail } from "../services/authorMail.service.js";

export function generateAuthorPassword(name = "AUTHOR", phone = "0000000000") {
  const cleanName = String(name).replace(/[^a-zA-Z]/g, "").toUpperCase();
  const namePart = cleanName.slice(0, 5) || "AUTHOR";

  const digits = String(phone).replace(/\D/g, "");
  const phonePart = digits.length >= 4 ? digits.slice(-4) : "1234";

  return `${namePart}${phonePart}`;
}

export async function createOrUpdateAuthorFromForm(data = {}) {
  try {
    const email = String(data.email || "").trim().toLowerCase();
    const name = String(data.name || data.authorName || "Author").trim();
    const phone = String(data.phone || "0000000000").trim();
    if (!email) return null;

    const rawPassword = generateAuthorPassword(name, phone);
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const authorId = `a${Date.now()}`;
    const selectedPlan = data.planName || "Basic Publishing Plan";
    const planAmount = Number(data.planAmount || 1212.00);

    let authorUser = await AuthorPortalUser.findOne({ email });

    if (!authorUser) {
      authorUser = new AuthorPortalUser({
        authorId,
        name,
        email,
        phone,
        passwordHash,
        role: "author",
        selectedPlan,
        planAmount,
        publishingPaymentStatus: data.paymentId ? "PAID" : "PENDING",
        amountPaid: data.paymentId ? planAmount : 0,
        books: data.bookTitle ? [{
          title: data.bookTitle,
          isbn: "PENDING",
          copiesPrinted: 0,
          copiesSold: 0,
          currentStock: 0,
          stockStatus: "LOW STOCK"
        }] : []
      });
    } else {
      authorUser.name = name || authorUser.name;
      authorUser.phone = phone || authorUser.phone;
      authorUser.selectedPlan = selectedPlan || authorUser.selectedPlan;
      authorUser.passwordHash = passwordHash;
      if (data.bookTitle && !authorUser.books.some(b => b.title === data.bookTitle)) {
        authorUser.books.push({
          title: data.bookTitle,
          isbn: "PENDING",
          copiesPrinted: 0,
          copiesSold: 0,
          currentStock: 0,
          stockStatus: "LOW STOCK"
        });
      }
    }

    await authorUser.save();

    // Send credentials email in background
    try {
      await sendAuthorCredentialsEmail({
        email: authorUser.email,
        name: authorUser.name,
        password: rawPassword,
        loginUrl: "https://authordashboard.netlify.app"
      });
      console.log(`[AuthorPortal] Credentials emailed to ${email} (Password: ${rawPassword})`);
    } catch (mailErr) {
      console.error(`[AuthorPortal] Failed to send credentials email to ${email}:`, mailErr);
    }

    return authorUser;
  } catch (err) {
    console.error("[AuthorPortal] Error creating/updating author from form:", err);
    return null;
  }
}

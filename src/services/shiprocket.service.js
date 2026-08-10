import { env } from "../config/env.js";

let cachedToken = null;
let tokenExpiryTime = 0;

/**
 * Obtain JWT token from Shiprocket API.
 * Caches token in memory until near expiration (10 days token lifetime).
 */
export const getShiprocketToken = async () => {
  const email = env.shiprocket.email;
  const password = env.shiprocket.password;

  if (!email || !password) {
    console.warn("[Shiprocket] Missing SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD in environment.");
    return null;
  }

  const now = Date.now();
  // Return cached token if valid (with 1 hour safety margin)
  if (cachedToken && now < tokenExpiryTime - 3600 * 1000) {
    return cachedToken;
  }

  try {
    const response = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok || !data.token) {
      console.error("[Shiprocket Auth Error]:", data.message || data);
      return null;
    }

    cachedToken = data.token;
    // Shiprocket token valid for 10 days
    tokenExpiryTime = now + 9 * 24 * 3600 * 1000;
    console.log("[Shiprocket] Successfully authenticated with Shiprocket API.");
    return cachedToken;
  } catch (error) {
    console.error("[Shiprocket Auth Exception]:", error.message);
    return null;
  }
};

/**
 * Automatically create an Ad-hoc Order in Shiprocket for a physical book purchase.
 */
export const createShiprocketOrder = async ({ purchase, book, user }) => {
  const token = await getShiprocketToken();
  if (!token) {
    console.warn("[Shiprocket] Skipping automatic order creation: missing or invalid authentication token.");
    return null;
  }

  const address = purchase.deliveryAddress || {};
  const formattedDate = new Date(purchase.createdAt || Date.now())
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  const fullName = (user.name || "Customer").trim();
  const nameParts = fullName.split(" ");
  const firstName = nameParts[0] || "Customer";
  const lastName = nameParts.slice(1).join(" ") || "";

  // Build clean street address
  let streetAddress = "";
  if (address.co) streetAddress += `C/O ${address.co}, `;
  if (address.nearbyLocation) streetAddress += `Landmark: ${address.nearbyLocation}, `;
  if (address.block) streetAddress += `Block: ${address.block}`;
  if (!streetAddress) streetAddress = address.district || "Address details provided in order";

  const payload = {
    order_id: `LT-${purchase._id.toString().slice(-8).toUpperCase()}`,
    order_date: formattedDate,
    pickup_location: env.shiprocket.pickupLocation || "Primary",
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: streetAddress.slice(0, 95),
    billing_address_2: address.postOffice ? `PO: ${address.postOffice}` : "",
    billing_city: address.district || "Agartala",
    billing_pincode: (address.pin || "799001").trim(),
    billing_state: address.state || "Tripura",
    billing_country: address.country || "India",
    billing_email: user.email || "customer@lekhoktripura.in",
    billing_phone: (user.phone || "9999999999").replace(/[^0-9]/g, "").slice(-10) || "9999999999",
    shipping_is_billing: true,
    order_items: [
      {
        name: book.title || "Paperback Book",
        sku: book._id.toString(),
        units: 1,
        selling_price: Math.max(1, purchase.amount - (purchase.deliveryCharge || 0)),
        discount: 0,
        tax: 18,
        hsn: 4901
      }
    ],
    payment_method: "Prepaid",
    shipping_charges: purchase.deliveryCharge || 0,
    sub_total: purchase.amount,
    length: 22,
    breadth: 15,
    height: 3,
    weight: 0.4
  };

  try {
    const response = await fetch("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || data.status_code === 0) {
      console.error("[Shiprocket Order Error]:", data);
      return null;
    }

    console.log(`[Shiprocket] Order created successfully! Order ID: ${data.order_id}, Shipment ID: ${data.shipment_id}`);
    return {
      orderId: data.order_id,
      shipmentId: data.shipment_id,
      status: data.status,
      raw: data
    };
  } catch (error) {
    console.error("[Shiprocket Order Exception]:", error.message);
    return null;
  }
};

/**
 * Check courier serviceability & estimated rate for a delivery pincode
 */
export const checkPincodeServiceability = async (deliveryPincode, weightKg = 0.4) => {
  const token = await getShiprocketToken();
  if (!token) return null;

  try {
    const url = `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=799001&delivery_postcode=${deliveryPincode}&weight=${weightKg}&cod=0`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[Shiprocket Serviceability Error]:", error.message);
    return null;
  }
};

/**
 * Track shipment status by AWB Code or Shipment ID
 */
export const trackShiprocketShipment = async (awbCode) => {
  const token = await getShiprocketToken();
  if (!token) return null;

  try {
    const response = await fetch(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awbCode}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[Shiprocket Tracking Error]:", error.message);
    return null;
  }
};

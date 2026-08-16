import { env } from "../config/env.js";

let cachedToken = null;
let tokenExpiryTime = 0;

/**
 * 1. Obtain JWT token from Shiprocket API.
 * Uses API User credentials (Settings -> API Users in Shiprocket Panel).
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
 * 2. Check courier serviceability & estimated shipping charges
 * GET /v1/external/courier/serviceability/
 */
export const checkPincodeServiceability = async (deliveryPincode, weightKg = 0.4, pickupPincode = "799001", cod = 0) => {
  const token = await getShiprocketToken();
  if (!token) return null;

  try {
    const url = `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${pickupPincode}&delivery_postcode=${deliveryPincode}&weight=${weightKg}&cod=${cod}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[Shiprocket Serviceability Error]:", error.message);
    return null;
  }
};

/**
 * 3. Create Ad-hoc Order in Shiprocket
 * POST /v1/external/orders/create/adhoc
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

  const bookPriceInclGST = Math.max(1, purchase.amount - (purchase.deliveryCharge || 0));
  const baseBookPricePreTax = Math.round((bookPriceInclGST / 1.18) * 100) / 100;

  const payload = {
    order_id: `LT-${purchase._id.toString().slice(-8).toUpperCase()}`,
    order_date: formattedDate,
    pickup_location: env.shiprocket.pickupLocation || "work",
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
        sku: book._id ? book._id.toString() : "BK-100",
        units: 1,
        selling_price: baseBookPricePreTax,
        discount: 0,
        tax: 18,
        hsn: 4901
      }
    ],
    payment_method: "Prepaid",
    shipping_charges: purchase.deliveryCharge || 0,
    sub_total: baseBookPricePreTax,
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
    console.log("[Shiprocket Order Raw Response]:", data);

    const orderId = data.order_id || data.data?.order_id || data.order_number || data.channel_order_id;
    const shipmentId = data.shipment_id || data.data?.shipment_id;

    if (!response.ok || data.status_code === 0 || !orderId) {
      console.error("[Shiprocket Order Error]:", data.message || data);
      return null;
    }

    console.log(`[Shiprocket] Order created successfully! Order ID: ${orderId}, Shipment ID: ${shipmentId}`);
    return {
      orderId,
      shipmentId,
      status: data.status,
      raw: data
    };
  } catch (error) {
    console.error("[Shiprocket Order Exception]:", error.message);
    return null;
  }
};

/**
 * 4. Fetch Order Details (including courier, AWB, shipment status)
 * GET /v1/external/orders/show/{order_id}
 */
export const getShiprocketOrderDetails = async (orderId) => {
  const token = await getShiprocketToken();
  if (!token || !orderId) return null;

  try {
    const response = await fetch(`https://apiv2.shiprocket.in/v1/external/orders/show/${orderId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();
    return data?.data || data;
  } catch (error) {
    console.error("[Shiprocket Get Order Details Error]:", error.message);
    return null;
  }
};

/**
 * 5. Track Shipment by Shipment ID
 * GET /v1/external/courier/track/shipment/{shipment_id}
 */
export const trackShiprocketByShipmentId = async (shipmentId) => {
  const token = await getShiprocketToken();
  if (!token || !shipmentId) return null;

  try {
    const response = await fetch(`https://apiv2.shiprocket.in/v1/external/courier/track/shipment/${shipmentId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[Shiprocket Track Shipment Error]:", error.message);
    return null;
  }
};

/**
 * 6. Track Shipment by AWB Code
 * GET /v1/external/courier/track/awb/{awb_code}
 */
export const trackShiprocketShipment = async (awbCode) => {
  const token = await getShiprocketToken();
  if (!token || !awbCode) return null;

  try {
    const response = await fetch(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awbCode}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[Shiprocket Tracking Error]:", error.message);
    return null;
  }
};

/**
 * 7. Get Configured Pickup Locations
 * GET /v1/external/settings/company/pickup
 */
export const getShiprocketPickupLocations = async () => {
  const token = await getShiprocketToken();
  if (!token) return null;

  try {
    const response = await fetch("https://apiv2.shiprocket.in/v1/external/settings/company/pickup", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[Shiprocket Pickup Locations Error]:", error.message);
    return null;
  }
};

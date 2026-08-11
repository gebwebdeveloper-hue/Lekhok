import { getShiprocketToken, checkPincodeServiceability, getShiprocketPickupLocations } from "../services/shiprocket.service.js";

async function testShiprocketIntegration() {
  console.log("==================================================");
  console.log("  LEKHOK TRIPURA - SHIPROCKET API INTEGRATION TEST");
  console.log("==================================================\n");

  console.log("Step 1: Authenticating API User with Shiprocket...");
  const token = await getShiprocketToken();

  if (!token) {
    console.error("❌ Authentication Failed!");
    console.error("Please ensure SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in Server/.env match your API User credentials created in Shiprocket (Settings -> API Users).\n");
    process.exit(1);
  }

  console.log("✅ Authentication Successful!");
  console.log(`🔑 Bearer Token: ${token.slice(0, 30)}...\n`);

  console.log("Step 2: Fetching Configured Pickup Locations from Shiprocket Account...");
  const pickupData = await getShiprocketPickupLocations();

  if (pickupData && pickupData.data && pickupData.data.shipping_address) {
    const locations = pickupData.data.shipping_address || [];
    console.log(`📍 Found ${locations.length} Pickup Location(s) in your Shiprocket Account:`);
    locations.forEach((loc) => {
      console.log(`   👉 Location Name / Nickname: "${loc.pickup_location}" (Pincode: ${loc.pin_code}, City: ${loc.city})`);
    });
    console.log(`\n💡 Make sure SHIPROCKET_PICKUP_LOCATION in Server/.env is set to one of the location names listed above!\n`);
  } else {
    console.log("⚠️ Could not fetch pickup locations:", pickupData);
  }

  console.log("Step 3: Testing Courier Serviceability (Destination Pincode: 110001)...");
  const serviceability = await checkPincodeServiceability("110001");

  if (serviceability && serviceability.data) {
    console.log("✅ Serviceability Check Successful!");
    const companies = serviceability.data.available_courier_companies || [];
    console.log(`📦 Found ${companies.length} available courier partners:`);
    companies.slice(0, 3).forEach((c) => {
      console.log(`   • ${c.courier_name} (Rate: ₹${c.rate}, Estimated Delivery: ${c.etd} days)`);
    });
  }

  console.log("\n==================================================");
  console.log("  TEST COMPLETE 🎉");
  console.log("==================================================");
  process.exit(0);
}

testShiprocketIntegration();

import { createShiprocketOrder } from "../services/shiprocket.service.js";

async function testOrderPush() {
  console.log("Testing live order push to Shiprocket with pickup location 'work'...\n");

  const mockPurchase = {
    _id: "6a7a940591c7117d058354ff",
    createdAt: new Date(),
    amount: 150,
    deliveryCharge: 0,
    deliveryAddress: {
      co: "Test",
      district: "West Tripura",
      block: "Agartala",
      pin: "799003",
      state: "Tripura",
      country: "India"
    }
  };

  const mockBook = {
    _id: "60d5ecb8b5c9c82b8c8b4567",
    title: "Rajbarir Gup..."
  };

  const mockUser = {
    name: "Kiran Samanta",
    email: "kiransamanta88@gmail.com",
    phone: "9876543210"
  };

  const result = await createShiprocketOrder({
    purchase: mockPurchase,
    book: mockBook,
    user: mockUser
  });

  console.log("\n==================================================");
  if (result && result.orderId) {
    console.log("🎉 SUCCESS! Live Order Created in Shiprocket!");
    console.log(`📦 Shiprocket Order ID   : ${result.orderId}`);
    console.log(`🚚 Shiprocket Shipment ID: ${result.shipmentId}`);
    console.log(`📊 Status               : ${result.status}`);
  } else {
    console.log("❌ Order Creation Failed:", result);
  }
  console.log("==================================================");
  process.exit(0);
}

testOrderPush();

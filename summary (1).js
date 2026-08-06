// api/analytics/summary.js  ->  deploys as GET /api/analytics/summary on Vercel
//
// Free tier: today's conversations/enquiries/confirmed orders, popular products.
// Premium tier adds: conversion rate, popular sizes/colours.
//
// Deliberately bounded reads: one analyticsDaily doc + up to 100 recent orders —
// never a full scan of orders/conversations history.

const { admin, db } = require("../../lib/firebaseAdmin");
const config = require("../../lib/config");
const { isPremiumActive } = require("../../lib/subscription");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: "Missing auth token" });

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const vendorId = decoded.uid;

    const vendorSnap = await db.collection("vendors").doc(vendorId).get();
    const vendor = vendorSnap.data();
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const isPremium = isPremiumActive(vendor);

    const today = new Date().toISOString().slice(0, 10);
    const analyticsSnap = await db.collection("analyticsDaily").doc(`${vendorId}_${today}`).get();
    const todayStats = analyticsSnap.exists
      ? analyticsSnap.data()
      : { conversations: 0, enquiries: 0, confirmedOrders: 0 };

    // AI usage today, for the dashboard's usage line
    const usageSnap = await db.collection("aiUsage").doc(`${vendorId}_${today}`).get();
    const aiUsageToday = usageSnap.exists ? usageSnap.data().count || 0 : 0;

    // Bounded read of recent confirmed orders for popularity/conversion stats
    const ordersSnap = await db
      .collection("orders")
      .where("vendorId", "==", vendorId)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const recentOrders = ordersSnap.docs.map((d) => d.data());

    const productCounts = {};
    const sizeCounts = {};
    const colourCounts = {};
    for (const o of recentOrders) {
      if (o.productName) productCounts[o.productName] = (productCounts[o.productName] || 0) + 1;
      if (o.size) sizeCounts[o.size] = (sizeCounts[o.size] || 0) + 1;
      if (o.colour) colourCounts[o.colour] = (colourCounts[o.colour] || 0) + 1;
    }
    const topN = (obj, n) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([name, count]) => ({ name, count }));

    const response = {
      today: {
        conversations: todayStats.conversations || 0,
        enquiries: todayStats.enquiries || 0,
        confirmedOrders: todayStats.confirmedOrders || 0,
      },
      aiUsage: { used: aiUsageToday, limit: isPremium ? config.PREMIUM_AI_LIMIT : config.FREE_AI_LIMIT },
      popularProducts: topN(productCounts, 5),
      isPremium,
    };

    if (isPremium) {
      response.conversionRate =
        todayStats.conversations > 0
          ? Math.round((todayStats.confirmedOrders / todayStats.conversations) * 100)
          : null;
      response.popularSizes = topN(sizeCounts, 5);
      response.popularColours = topN(colourCounts, 5);
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error("Analytics summary error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

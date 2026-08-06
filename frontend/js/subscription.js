// js/subscription.js
//
// Mirrors backend/lib/subscription.js — checks subscriptionExpiry, not just
// the plan/status fields, so the UI doesn't keep showing "Premium" forever
// after it's actually lapsed.

export function isPremiumActive(vendor) {
  if (!vendor) return false;
  if (vendor.plan !== "premium" || vendor.subscriptionStatus !== "active") return false;
  if (!vendor.subscriptionExpiry) return false;
  return new Date(vendor.subscriptionExpiry).getTime() > Date.now();
}

// lib/subscription.js
//
// The single source of truth for "is this vendor actually Premium right
// now." Previously, every call site checked vendor.plan === "premium" &&
// vendor.subscriptionStatus === "active" directly — which never expired.
// Since billing here is manual (no auto-recurring charge), a vendor who
// paid once and never renewed would stay "active" forever with nothing to
// flip it back. This checks subscriptionExpiry too.

function isPremiumActive(vendor) {
  if (!vendor) return false;
  if (vendor.plan !== "premium" || vendor.subscriptionStatus !== "active") return false;
  if (!vendor.subscriptionExpiry) return false;
  return new Date(vendor.subscriptionExpiry).getTime() > Date.now();
}

module.exports = { isPremiumActive };

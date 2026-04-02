
// server/src/utils/profileCompletion.js

import User from "../modules/user/user.model.js";
import Influencer from "../modules/influencer/influencer.model.js";
import Brand from "../modules/brand/brand.model.js";

/**
 * Minimum required fields for each role.
 * Returns { isComplete, missing[], percent, completed, total }
 */
export const getCompletionStatus = async (userId, role) => {
  const user = await User.findById(userId).lean();
  if (!user) return { isComplete: false, percent: 0, missing: ["User not found"], completed: 0, total: 1 };

  const missing = [];

  // ── Shared fields (both roles) ────────────────────────────────────────────
  if (!user.fullname?.trim())   missing.push("Full name");
  if (!user.profilePic?.trim()) missing.push("Profile photo");

  // ── Influencer-specific ───────────────────────────────────────────────────
  if (role === "influencer") {
    const inf = await Influencer.findOne({ user: userId }).lean();

    if (!inf) {
      missing.push("Bio / About", "Username", "Content category", "At least one platform", "Service pricing");
    } else {
      if (!inf.username?.trim())   missing.push("Username");
      if (!inf.about?.trim())      missing.push("Bio / About");
      if (!inf.category?.trim())   missing.push("Content category");

      const hasPlatform = Array.isArray(inf.platforms) && inf.platforms.length > 0;
      if (!hasPlatform) {
        missing.push("At least one social platform");
        missing.push("At least one service with pricing");
      } else {
        const hasService = inf.platforms.some(
          (p) => Array.isArray(p.services) && p.services.length > 0
        );
        if (!hasService) missing.push("At least one service with pricing");
      }
    }

    const total = 7; // fullname, profilePic, username, about, category, platform, service
    const completed = Math.max(0, total - missing.length);
    const percent = Math.round((completed / total) * 100);
    return { isComplete: missing.length === 0, percent, missing, completed, total };
  }

  // ── Brand-specific ────────────────────────────────────────────────────────
  if (role === "brand") {
    const brand = await Brand.findOne({ user: userId }).lean();

    if (!brand) {
      missing.push("Brand name", "Industry", "Brand description", "Budget range");
    } else {
      if (!brand.brandname?.trim())   missing.push("Brand name");
      if (!brand.industry?.trim())    missing.push("Industry");
      if (!brand.description?.trim()) missing.push("Brand description");

      const hasBudget =
        typeof brand.budgetRange?.min === "number" &&
        typeof brand.budgetRange?.max === "number" &&
        brand.budgetRange.max > 0;
      if (!hasBudget) missing.push("Budget range (min & max)");
    }

    const total = 6; // fullname, profilePic, brandname, industry, description, budget
    const completed = Math.max(0, total - missing.length);
    const percent = Math.round((completed / total) * 100);
    return { isComplete: missing.length === 0, percent, missing, completed, total };
  }

  return { isComplete: false, percent: 0, missing: ["Unknown role"], completed: 0, total: 1 };
};

/**
 * Checks completion and writes profileComplete to User doc if it changed.
 * Call this after every profile save.
 */
export const checkAndMarkComplete = async (userId, role) => {
  const { isComplete } = await getCompletionStatus(userId, role);

  // Only write if something changed — avoids redundant DB writes
  const user = await User.findById(userId).select("profileComplete");
  if (user && user.profileComplete !== isComplete) {
    await User.findByIdAndUpdate(userId, {
      profileComplete: isComplete,
      profileCompletedAt: isComplete ? new Date() : null,
    });
  }

  return isComplete;
};
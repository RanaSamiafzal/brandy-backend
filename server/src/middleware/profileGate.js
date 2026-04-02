// server/src/middleware/profileGate.js

import { ApiError } from "../utils/ApiError.js";
import { validationStatus } from "../utils/ValidationStatusCode.js";

/**
 * Blocks the request if the logged-in user's profile is not complete.
 *
 * Usage:
 *   router.post("/apply", verifyJwt, requireProfileComplete, controller.apply);
 *
 * The verifyJwt middleware must run first — it attaches req.user which
 * now includes the profileComplete field from the User model.
 */
export const requireProfileComplete = (req, res, next) => {
  if (!req.user) {
    throw new ApiError(validationStatus.unauthorized, "Not authenticated");
  }

  if (!req.user.profileComplete) {
    throw new ApiError(
      validationStatus.forbidden,
      "Please complete your profile before using this feature. Go to Settings → Profile."
    );
  }

  next();
};
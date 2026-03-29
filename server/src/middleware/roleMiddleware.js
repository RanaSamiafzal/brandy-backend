import { ApiError } from "../utils/ApiError.js";
import { validationStatus } from "../utils/ValidationStatusCode.js";

export const roleMiddleware = (...allowedRoles) => {
  const roles = allowedRoles.flat();
  return (req, res, next) => {

    if (!req.user) {
      throw new ApiError(
        validationStatus.unauthorized,
        "Unauthorized access"
      );
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError(
        validationStatus.forbidden,
        "You do not have permission to access this resource"
      );
    }
    next();
  };
};

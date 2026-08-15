import { geoService } from "./geo.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";

const searchPlaces = AsyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
        return res.status(validationStatus.ok).json(
            new ApiResponse(validationStatus.ok, { places: [] }, "Type at least 2 characters")
        );
    }
    const places = await geoService.searchPlaces(q);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { places }, "Places fetched")
    );
});

const reversePlace = AsyncHandler(async (req, res) => {
    const { lat, lng } = req.query;
    if (lat === undefined || lng === undefined) {
        throw new ApiError(validationStatus.badRequest, "lat and lng are required");
    }
    const place = await geoService.reversePlace(lat, lng);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { place }, "Location resolved")
    );
});

const getMapsConfig = AsyncHandler(async (_req, res) => {
    const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_BROWSER_KEY || "";
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { googleMapsKey: googleMapsKey || null }, "Maps config fetched")
    );
});

export const geoController = { searchPlaces, reversePlace, getMapsConfig };

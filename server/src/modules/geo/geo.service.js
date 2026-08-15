import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const USER_AGENT = "BrandlyFYP/1.0 (academic influencer marketplace)";
const MIN_INTERVAL_MS = 1100;
const cache = new Map();
const CACHE_TTL = 2 * 60 * 1000;

let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const nominatimFetch = async (url) => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const res = await fetch(url, {
        headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.9",
        },
    });
    if (!res.ok) {
        throw new ApiError(validationStatus.badGateway, "Map search is temporarily unavailable");
    }
    return res.json();
};

const cached = async (key, fn) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;
    const value = await fn();
    cache.set(key, { at: Date.now(), value });
    return value;
};

const hasLocalScript = (value) =>
    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u097F]/.test(String(value || ""));

const pickEnglish = (...candidates) => {
    const cleaned = candidates.map((c) => String(c || "").trim()).filter(Boolean);
    return cleaned.find((c) => !hasLocalScript(c)) || cleaned[0] || "";
};

const formatPlace = (item) => {
    const address = item.address || {};
    const namedetails = item.namedetails || {};
    const city = pickEnglish(
        address.city,
        address.town,
        address.village,
        address.suburb,
        address.county,
        address.state,
        namedetails["name:en"]
    );
    const country = pickEnglish(address.country);
    const formatted = pickEnglish(
        item.display_name,
        [namedetails["name:en"], city, country].filter(Boolean).join(", "),
        [city, country].filter(Boolean).join(", ")
    );
    return {
        lat: Number(item.lat),
        lng: Number(item.lon),
        city,
        country,
        formatted,
    };
};

const searchPlaces = async (q) => {
    const query = String(q || "").trim();
    if (query.length < 2) return [];
    const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&namedetails=1&limit=6&accept-language=en&q=${encodeURIComponent(query.slice(0, 80))}`;
    const rows = await cached(`s:en2:${query.toLowerCase()}`, () => nominatimFetch(url));
    return (Array.isArray(rows) ? rows : []).map(formatPlace).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
};

const reversePlace = async (lat, lng) => {
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
        throw new ApiError(validationStatus.badRequest, "Valid latitude and longitude are required");
    }
    const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&namedetails=1&accept-language=en&lat=${latN}&lon=${lngN}`;
    const item = await cached(`r:en2:${latN.toFixed(4)},${lngN.toFixed(4)}`, () => nominatimFetch(url));
    if (!item || item.error) {
        return { lat: latN, lng: lngN, city: "", country: "", formatted: `${latN.toFixed(4)}, ${lngN.toFixed(4)}` };
    }
    return formatPlace(item);
};

export const geoService = { searchPlaces, reversePlace };

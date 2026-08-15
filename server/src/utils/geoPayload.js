export const parseGeoPayload = (geo) => {
    if (geo === undefined || geo === null || geo === "") return undefined;
    let parsed = geo;
    if (typeof geo === "string") {
        try {
            parsed = JSON.parse(geo);
        } catch {
            return null;
        }
    }
    if (typeof parsed !== "object") return null;
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return {
        lat,
        lng,
        city: String(parsed.city || "").trim(),
        country: String(parsed.country || "").trim(),
        formatted: String(parsed.formatted || "").trim(),
    };
};

export const geoSchemaFields = {
    lat: { type: Number, min: -90, max: 90, default: null },
    lng: { type: Number, min: -180, max: 180, default: null },
    city: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    formatted: { type: String, trim: true, default: "" },
};

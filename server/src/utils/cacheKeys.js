
 const CACHE_KEYS = {
  USER_AUTH: (userId) => `user:auth:${userId}`,

  USER_PROFILE: (userId) => `user:profile:${userId}`,

  INFLUENCER_PROFILE: (userId) =>
    `influencer:profile:${userId}`,

  BRAND_PROFILE: (userId) =>
    `brand:profile:${userId}`,

  INFLUENCER_DASHBOARD: (userId) =>
    `influencer:dashboard:${userId}`,

  BRAND_DASHBOARD: (userId) =>
    `brand:dashboard:${userId}`,
};



export default {
  CACHE_KEYS
};

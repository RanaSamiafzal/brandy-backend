import passport from "passport";
import GoogleOAuth from "passport-google-oauth20";
import User from "../modules/user/user.model.js";
import Brand from "../modules/brand/brand.model.js";

const { Strategy: GoogleStrategy } = GoogleOAuth;

// ── Strategy 1: Google Sign-In / Sign-Up ─────────────────────────────────────
// Used for: /auth/google login flow
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            user = await User.create({
              fullname: profile.displayName,
              email: profile.emails?.[0]?.value,
              googleId: profile.id,
              isGoogleUser: true,
              password: "google-auth-user",
              role: "brand",
            });

            await Brand.create({
              user: user._id,
              brandname: user.fullname || "My Brand",
              budgetRange: { min: 0, max: 0 },
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

export default passport;

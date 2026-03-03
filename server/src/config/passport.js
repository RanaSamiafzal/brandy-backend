import passport from "passport";
import GoogleOAuth from "passport-google-oauth20";
import User from "../models/userModel.js";

const { Strategy: GoogleStrategy } = GoogleOAuth;

// Only initialize Google Strategy if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists
          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            user = await User.create({
              fullname: profile.displayName,
              email: profile.emails?.[0]?.value,
              googleId: profile.id,
              isGoogleUser: true,
              password: "google-auth-user", // You can hash or make optional in schema
              role: "brand",
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

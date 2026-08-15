import passport from "passport";
import GoogleOAuth from "passport-google-oauth20";

const { Strategy: GoogleStrategy } = GoogleOAuth;

// Login / signup only. Profile upsert lives in authService.loginWithGoogle.
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
          return done(null, profile);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

export default passport;

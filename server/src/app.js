import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser';
import passport from './config/passport.js'
import authRouter from './modules/auth/auth.routes.js'
import userRouter from './modules/user/user.routes.js'
import brandRouter from './modules/brand/brand.routes.js'
import influencerRouter from './modules/influencer/influencer.routes.js'
import campaignRouter from './modules/campaign/campaign.routes.js'
import collaborationRouter from './modules/collaboration/collaboration.routes.js'
import activityRouter from './modules/activity/activity.routes.js'
import messageRouter from './modules/message/message.routes.js'
import oauthRouter from './modules/oauth/oauth.routes.js'
import platformRouter from './modules/platform/platform.routes.js'
import aiMatchRouter from './modules/aiMatch/aiMatch.routes.js'
import stripeRouter from './modules/payment/stripe.routes.js'
import notificationRouter from './modules/notification/notification.routes.js'
import adminRouter from './modules/admin/admin.routes.js'
import supportRouter from './modules/support/support.routes.js'
import moderationRouter from './modules/moderation/moderation.routes.js'
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import xss from 'xss-clean';
import rateLimit from 'express-rate-limit';
import { stripeController } from './modules/payment/stripe.controller.js'
import compression from 'compression';
import { errorMiddleware } from './middleware/errorMiddleware.js';

const app = express()

// Trust reverse proxy (e.g. Load Balancer) for secure cookies and accurate IP rate limiting
app.set('trust proxy', 1);

// Fix for Express 5: req.query is a getter-only property. 
// We must make it writable BEFORE any sanitization middleware (xss, mongo-sanitize) runs.
app.use((req, res, next) => {
    const query = { ...req.query };
    Object.defineProperty(req, 'query', {
        value: query,
        writable: true,
        configurable: true,
        enumerable: true
    });
    next();
});

// Global Security Middleware
// app.use(helmet()); // Set security HTTP headers
app.use(compression()); // Compress all responses


app.use(
    helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],

                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://js.stripe.com",
                ],

                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://fonts.googleapis.com",
                ],

                fontSrc: [
                    "'self'",
                    "https://fonts.gstatic.com",
                    "data:",
                ],

                imgSrc: [
                    "'self'",
                    "data:",
                    "blob:",
                    "https:",
                ],

                connectSrc: [
                    "'self'",
                    "ws:",
                    "wss:",
                    process.env.CORS_ORIGIN || "http://localhost:5173",
                    "https://api.stripe.com",
                ],

                frameSrc: [
                    "'self'",
                    "https://js.stripe.com",
                ],

                objectSrc: ["'none'"],

                upgradeInsecureRequests: [],
            },
        },
    })
);

app.use(xss());    // Data sanitization against XSS

// Rate Limiters
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});

const paymentLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 50,
    message: 'Too many payment requests from this IP, please try again after 10 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter limiter for AI actions (computational heavy)
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    message: 'AI usage limit reached. Please try again in an hour.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter limiter for Admin routes
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500, // Higher limit for admins but still protected against abuse
    standardHeaders: true,
    legacyHeaders: false,
});

// Stripe Webhook MUST come before express.json
app.post(
    '/api/v1/payment/webhook',
    express.raw({ type: 'application/json' }),
    stripeController.stripeWebhook
);


if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log("Incoming:", req.method, req.url);
        next();
    });
}

// Apply rate limiters to specific paths
app.use('/api/v1/auth', authLimiter);
app.use('/api/v1/payment', paymentLimiter);
app.use('/api/v1/aiMatch', aiLimiter);
app.use('/api/v1/admin', adminLimiter);

// we use cors  for setting that which origin we will accept the req 
app.use(cors({
    origin: [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        process.env.CORS_ORIGIN
    ].filter(Boolean),
    credentials: true
}))


// for accept jason here but set the limit of accepting json
app.use(express.json({ limit: '16kb' }))

// here we use urlencoded for receiving data from url 
app.use(express.urlencoded({
    extended: true,
    limit: '16kb'
})) // use  extended for accepting nested object

// Data sanitization against NoSQL query injection (applied after body parsing)
app.use(mongoSanitize());

app.use(express.static('public', {
    dotfiles: 'ignore', // Prevent exposure of sensitive dotfiles (.env, etc.)
    index: false        // Disable directory indexing
}))

app.use(cookieParser())
app.use(passport.initialize());

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Brandy API Running Successfully",
    });
});


console.log("🚀 Server starting...");
console.log("📌 Webhook route registered");
console.log("📌 Base API URL:", process.env.BASE_URL);


// routes declaration
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/users', userRouter)
app.use('/api/v1/brands', brandRouter)
app.use('/api/v1/influencers', influencerRouter)
app.use('/api/v1/campaigns', campaignRouter)
app.use('/api/v1/collaborations', collaborationRouter)
app.use('/api/v1/activities', activityRouter)
app.use('/api/v1/messages', messageRouter)
app.use('/api/v1/oauth', oauthRouter)
app.use('/api/v1/platforms', platformRouter)
app.use('/api/v1/aiMatch', aiMatchRouter)
app.use('/api/v1/payment', stripeRouter)
app.use('/api/v1/notifications', notificationRouter)
app.use('/api/v1/admin', adminRouter)
app.use('/api/v1/support', supportRouter)
app.use('/api/v1/moderation', moderationRouter)

app.get('/api/v1/ping', (req, res) => res.json({
    status: 'ok',
    server: 'brandy-backend-primary',
    timestamp: new Date().toISOString()
}))

// Error handling middleware
app.use(errorMiddleware);

export { app }

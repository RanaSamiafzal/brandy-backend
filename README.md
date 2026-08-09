<div align="center">

# 🚀 Brandly — Backend

**AI-based Brand ↔ Influencer collaboration platform — REST API, real-time messaging, and Stripe escrow, built on Node.js / Express / MongoDB.**

![Node](https://img.shields.io/badge/Node.js-v22%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Stripe](https://img.shields.io/badge/Payments-Stripe%20Connect-635BFF?logo=stripe&logoColor=white)
![Socket.io](https://img.shields.io/badge/Realtime-Socket.io-010101?logo=socket.io&logoColor=white)
![License](https://img.shields.io/badge/status-FYP%20%2F%20active--dev-yellow)

[Overview](#-overview) •
[Tech Stack](#-tech-stack) •
[Quick Start](#-quick-start) •
[API Reference](#-api-reference) •
[Architecture](#-architecture) •
[Security Notes](#-security-notes)

</div>

---

## 📖 Overview

Brandly's backend is the API + realtime layer that powers a two-sided marketplace connecting **Brands** (who run influencer campaigns) with **Influencers** (who deliver content). It handles the full lifecycle of a paid collaboration:

```
Brand posts campaign → Influencer applies/is matched → Both sign the agreement
   → Brand funds escrow (Stripe) → Influencer delivers work → Brand approves
   → Funds automatically release to the influencer's Stripe Connect account
```

<details>
<summary><b>✨ Click to expand: Key features</b></summary>

- **Mutual Agreement Flow** — both parties must digitally confirm terms before a collaboration goes live.
- **Secure Escrow** — brand funds are held via Stripe PaymentIntents and released per-deliverable, not all at once.
- **Real-Time Everything** — Socket.io rooms push live updates for messages, deliverable status, payments, and notifications.
- **OAuth Platform Verification** — influencers link YouTube / Instagram / Facebook / TikTok / LinkedIn accounts to prove reach.
- **AI Matching** — pairs brands with relevant influencers based on niche/budget/audience.
- **Granular Deliverables** — a collaboration is broken into deliverables, each individually submitted, reviewed, and paid.

</details>

---

## 🧰 Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js (v22+) |
| Framework | Express 5 |
| Database | MongoDB Atlas (Mongoose ODM) |
| Realtime | Socket.io (project-scoped rooms) |
| Payments | Stripe (PaymentIntents + Stripe Connect Express payouts) |
| Auth | JWT (access + refresh cookies) · Passport.js (Google OAuth 2.0) |
| File storage | Cloudinary |
| Email | Nodemailer (SMTP, OTP delivery) |
| Validation | Joi |
| Hardening | Helmet · express-mongo-sanitize · express-rate-limit |

---

## ⚡ Quick Start

<details open>
<summary><b>1. Prerequisites</b></summary>

- [Node.js](https://nodejs.org/) v22+
- A [MongoDB Atlas](https://www.mongodb.com/products/platform/atlas-database) cluster
- A [Cloudinary](https://cloudinary.com/) account (media uploads)
- A [Stripe](https://dashboard.stripe.com/) account (Connect enabled)

</details>

<details>
<summary><b>2. Install</b></summary>

```bash
git clone https://github.com/RanaSamiafzal/brandy-backend.git
cd brandy-backend
npm install              # root deps
npm run install-server   # server-specific deps
```

</details>

<details>
<summary><b>3. Configure environment</b></summary>

```bash
cd server
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | Server port, e.g. `8000` |
| `CORS_ORIGIN` | Allowed frontend origin |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary credentials |
| `ACCESS_TOKEN_SECRET` / `ACCESS_TOKEN_EXPIRY` | JWT access token signing + TTL |
| `REFRESH_TOKEN_SECRET` / `REFRESH_TOKEN_EXPIRY` | JWT refresh token signing + TTL |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASS` | SMTP for OTP emails |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Google OAuth |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe API + webhook signature verification |
| `META_APP_ID` / `META_APP_SECRET` / `META_CALLBACK_URL` | Facebook/Instagram OAuth |

> ⚠️ Never commit a real `.env` — only `.env.example` belongs in the repo.

</details>

<details>
<summary><b>4. Run</b></summary>

```bash
npm run dev     # development (nodemon, auto-restart)
npm start       # production
```

Server boots at `http://localhost:<PORT>` — health check at `GET /api/v1/ping`.

</details>

---

## 🗺️ API Reference

<details>
<summary><b>Auth — <code>/api/v1/auth</code></b></summary>

| Method | Endpoint | Description |
|---|---|---|
| POST | `/register` | Create account (`brand`/`influencer`) |
| POST | `/login` | Email + password login → sets JWT cookies |
| POST | `/logout` | Clears session |
| POST | `/refresh-token` | Rotate access token via refresh cookie |
| POST | `/forgot-password` → `/reset-password` | OTP-based password reset |
| POST | `/change-password` | Authenticated password change |
| POST | `/send-otp` → `/verify-otp` | Email verification |
| GET | `/facebook`, `/facebook/callback` | Facebook/Instagram OAuth |
| GET | `/youtube/callback` | YouTube OAuth callback |

</details>

<details>
<summary><b>Users, Brands, Influencers</b></summary>

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/users/me` | Current user + role profile + completion status |
| PATCH | `/api/v1/users/update-profile` | Update name/avatar/cover |
| PATCH | `/api/v1/users/status` | Set online/offline |
| DELETE | `/api/v1/users` | Delete account |
| GET | `/api/v1/brands/dashboard`, `/analytics`, `/influencers` | Brand-only views |
| GET | `/api/v1/influencers/search`, `/:influencerId` | Influencer directory |
| PATCH | `/api/v1/influencers/update-profile` | Influencer-only profile update |

</details>

<details>
<summary><b>Campaigns & Collaborations</b></summary>

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/v1/campaigns` | List / create campaigns (brand-only create) |
| PATCH/DELETE | `/api/v1/campaigns/:id` | Update / delete a campaign |
| POST | `/api/v1/campaigns/:id/apply` | Influencer applies to a campaign |
| POST/GET | `/api/v1/collaborations/request` | Send / list collaboration requests |
| POST | `/api/v1/collaborations/request/:id/accept\|reject\|cancel\|counter-offer` | Negotiation flow |
| GET | `/api/v1/collaborations/:id` | Full collaboration detail |
| POST | `/api/v1/collaborations/:id/deliverables` | Add a deliverable |
| PATCH | `/api/v1/collaborations/:id/deliverables/:deliverableId/review` | Brand approves/rejects |

</details>

<details>
<summary><b>Payments — <code>/api/v1/payment</code> (Stripe escrow)</b></summary>

| Method | Endpoint | Description |
|---|---|---|
| POST | `/escrow/fund` | Brand creates a PaymentIntent to fund escrow |
| POST | `/escrow/sync` | Manually reconcile escrow status with Stripe |
| POST | `/deliverable/:id/start`, `/submit`, `/approve` | Deliverable lifecycle + payout trigger |
| POST | `/connect/onboard` | Influencer starts Stripe Connect onboarding |
| GET | `/methods` / POST `/methods/setup` / DELETE `/methods/:id` | Card management (brand) |
| GET | `/history` | Payment history for the logged-in user |
| POST | `/webhook` | Stripe webhook (signature-verified, raw body) |

</details>

<details>
<summary><b>Messaging & Notifications</b></summary>

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/messages/conversations` | List conversations |
| GET | `/api/v1/messages/:conversationId` | Get messages in a thread |
| POST | `/api/v1/messages` | Send a message |
| PUT | `/api/v1/messages/:messageId/react` | React with emoji |
| GET | `/api/v1/notifications` | Notification feed |
| GET | `/api/v1/activities` | Activity log feed |

</details>

Full request/response shapes: [`api.md`](./api.md).

---

## 🏗️ Architecture

```
server/src/
├── app.js                # Express app, middleware, route mounting
├── index.js               # Entry point / HTTP + Socket.io bootstrap
├── config/                 # db, cloudinary, passport, socket
├── middleware/             # auth, role, validation, multer, error handling
├── modules/
│   ├── auth/                # register, login, OTP, Facebook OAuth
│   ├── oauth/                # generic platform-verification OAuth (YouTube etc.)
│   ├── user/ brand/ influencer/   # profiles
│   ├── campaign/             # brand campaigns
│   ├── collaboration/        # requests → agreement → deliverables → completion
│   ├── payment/               # Stripe escrow, Connect, payouts, webhooks
│   ├── message/                # conversations + realtime chat
│   ├── notification/ activity/  # feeds
│   ├── aiMatch/                # brand↔influencer matching
│   └── platform/               # OAuth platform metadata
└── utils/                  # ApiError, ApiResponse, async handler, email, logging
```

Each module follows **routes → controller → service → model**, keeping HTTP concerns, business logic, and persistence separate.

<details>
<summary><b>💸 How escrow payouts work (high level)</b></summary>

1. Brand + influencer both digitally confirm the agreement (`confirmAgreement`).
2. Brand funds escrow → `stripe.paymentIntents.create()`, ID stored on the collaboration immediately (self-healing if the webhook is delayed).
3. Stripe webhook `payment_intent.succeeded` marks `escrowFunded: true`.
4. Influencer marks deliverables in-progress → submitted.
5. Brand approves a deliverable → `transferDeliverablePayout()` runs inside a MongoDB transaction, calculates the payout (full remaining balance if it's the final deliverable, otherwise its allocated share), and calls `stripe.transfers.create()` with an idempotency key so retries can't double-pay.

</details>

---

## 🔒 Security Notes

> A full audit of this codebase was performed separately. Highlights of what's already solid, and what needs attention before shipping further:

**Solid:** bcrypt password hashing · hashed + expiring OTPs with attempt limits · httpOnly JWT cookies · Stripe webhook signature verification · idempotency keys + DB transactions around payouts · Helmet + mongo-sanitize · scoped rate limiting.

**Needs fixing before production:**
- `role` in public registration currently accepts `"admin"` — restrict to `brand`/`influencer` only.
- Messaging endpoints (`getMessages`, `sendMessage`, `reactToMessage`) don't verify the requester is a conversation participant — add that check.
- OAuth `state` parameter is generated but never validated on callback.

See the full audit report for details, PoCs, and fixes.

---

## 🤝 Contributing

```bash
git checkout -b feature/AmazingFeature
git commit -m "Add AmazingFeature"
git push origin feature/AmazingFeature
# open a Pull Request
```

<div align="center">
<sub>Last updated: March 2026 · Brandly — bridging brands and influencers.</sub>
</div>

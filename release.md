# Brandy - Project Release Documentation 🚀

## Project Overview

**Brandy** is a premium brand-influencer collaboration platform. This document tracks the current development progress and system architecture.

---

## ✅ Current Project State

### Core Systems

- **Auth System**: Fully implemented (JWT, Cookies, Refresh Flow, Password Reset).
- **Social Auth**: Google OAuth integration is live.
- **File System**: Cloudinary integration for profile, cover, and campaign images.
- **Brand Tools**: Full suite of campaign management and dashboard analytics.
- **Discovery**: Advanced aggregation-based influencer search with multi-dimensional filtering.
- **Collaborations**: End-to-end request flow (Send -> Track -> Cancel).

### Routes Synchronized

- **Users**: `/api/v1/users/*`
- **Brands**: `/api/v1/brands/*` (Includes campaigns, discovery, and requests).

---

## 🚧 Partially Implemented / In Progress

1. **Influencer Dashboard**: Backend model exists; full controller logic and routes are being finalized.
2. **Brand Profile Settings**: Extended settings (social links, password change) have skeleton controllers but need route mapping.
3. **Activity Status**: Notifications can be fetched; marking as 'read' or deleting is in progress.

---

## ⏳ Not Implemented (Future Scope)

1. **Real-time Notifications**: Planned via WebSockets/Socket.io.
2. **Review & Rating**: System to rate influencers after campaign completion.
3. **Payment Gateway**: Integration for secure budget escrow and payments.
4. **Admin Panel**: For platform-wide moderation.

---

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Auth**: JWT, Passport.js
- **Storage**: Cloudinary
- **Mail**: Nodemailer

---

## 📂 Project Structure

```text
server/src/
├── controllers/      # Business logic
├── models/           # Mongoose schemas
├── routes/           # API endpoints
├── middleware/       # Auth, Roles, File Uploads
├── config/           # DB, Cloudinary, Passport
└── utils/            # Shared helpers (ApiError, ApiResponse)
```

---

_Last Updated: March 2026_

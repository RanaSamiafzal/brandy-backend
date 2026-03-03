# Brandy API Documentation 🚀

> Welcome to the Brandy AI-Based Brand-Influencer Platform API. Use this guide to integrate with the backend seamlessly.

---

## 🌐 Base URL

```
http://localhost:8000/api/v1
```

---

## � Quick Route Reference

### 👤 User & Auth (`/users`)

- `POST /register` - Multi-part registration
- `POST /login` - Direct login
- `POST /logout` - Secure logout
- `POST /refresh-token` - Refresh JWT
- `GET /profile` - Get current profile
- `PATCH /update-profile` - Update profile details
- `POST /forgot-password` - Trigger OTP
- `POST /reset-password` - Reset with OTP
- `GET /google` - Google OAuth Init
- `GET /google/callback` - OAuth Callback

### 🏢 Brand Operations (`/brands`)

- `GET /dashboard` - Aggregated stats
- `GET /activities` - Notification feed (Paginated)
- `POST /campaigns` - Create Campaign
- `GET /campaigns` - List all (Filtered/Paginated)
- `GET /campaigns/:campaignId` - Campaign details
- `PUT /campaigns/:campaignId` - Update details
- `DELETE /campaigns/:campaignId` - Soft delete
- `PATCH /campaigns/:campaignId/status` - Change status
- `GET /influencers` - Discovery/Search (Complex Aggregation)
- `GET /influencers/:influencerId` - Full Influencer details
- `POST /collaboration-requests` - Send request
- `GET /collaboration-requests` - List sent requests
- `GET /collaboration-requests/:requestId` - Request details
- `PATCH /collaboration-requests/:requestId/cancel` - Cancel request

---

## 👤 User Profiles & Identity

### Registration & Login

- **Database Stored**: Creates `User` document. Stores `fullname`, `email`, `password` (hashed), `role`, `profilePic` (Cloudinary URL), `coverPic` (Cloudinary URL).
- **Security**: Sets `accessToken` and `refreshToken` cookies upon success.

### Profile Management

- **GET /users/profile**:
  - **Fetched**: `User` details excluding `password` and `refreshToken`.
- **PATCH /users/update-profile**:
  - **Stored**: Updates `fullname`, `email`, `password`, and uploads new images to Cloudinary.

---

## 🔐 Security & Authentication

### JWT Strategy

- **HttpOnly Cookies**: tokens are stored securely in cookies.
- **Refresh Flow**: `POST /users/refresh-token` validates the `refreshToken` against the database before issuing new tokens.

### Password Recovery

- **Forgot Password**:
  - **Logic**: Generates a 6-digit OTP, hashes it, and stores it in the `User` model with an expiry (`passwordResetOTP`, `passwordResetExpires`).
  - **Action**: Sends email with plain-text OTP.
- **Reset Password**:
  - **Logic**: Compares hashed OTP from DB, resets password, and clears reset fields.

---

## 🏢 Brand Management

### 📊 Brand Dashboard

- **GET /brands/dashboard**
  - **Stats Fetched**:
    - `Campaign` aggregation: total, active, completed.
    - `CollaborationRequest` aggregation: total, accepted, pending, unique influencers contacted.
    - `Campaign` find: Last 5 recent campaigns.

### 📢 Campaign Logic

- **POST /brands/campaigns**: Creates `Campaign` document linked to `Brand`.
- **GET /brands/campaigns**: Supports `search` (regex title), `status` filters, and `budget` ranges.
- **Soft Delete**: `DELETE` routes set `isDeleted: true` instead of removing data.

### 🔍 Influencer Discovery

- **GET /brands/influencers**:
  - **Logic**: Advanced MongoDB Aggregation.
  - **Filters**: Category, Platform, Price Range, Followers, Rating, Location.
  - **Faceted Search**: Returns both data and total count for pagination in a single query.

---

## 🔔 Activity & Notifications

- **POST /brands/activities**: All major actions (creating campaigns, sending requests) trigger an entry in the `Activity` model.
- **GET /brands/activities**:
  - **Fetched**: Filtered notifications for the logged-in user.
  - **Aggregation**: Uses `$facet` to return `data`, `totalCount`, and `unreadCount` simultaneously.

---

## ⚠️ Error Handling

| Code | Meaning                          |
| ---- | -------------------------------- |
| 400  | Bad Request (Validation failure) |
| 401  | Unauthorized (Invalid Token)     |
| 403  | Forbidden (Wrong Role)           |
| 404  | Not Found                        |
| 429  | Too Many Requests (OTP attempts) |
| 500  | Internal Server Error            |

---

## 🚀 Environment & Deployment

### Environment Variables

- `MONGODB_URI`: Database connection
- `ACCESS_TOKEN_SECRET`: JWT Access key
- `REFRESH_TOKEN_SECRET`: JWT Refresh key
- `CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET`: Image hosting
- `CORS_ORIGIN`: Your Frontend URL (e.g. `http://localhost:5173`)

### Deployment (Vercel)

The backend is optimized for Vercel with a `vercel.json` configuration. Ensure the **Root Directory** is set to `server` in Vercel settings.

---

## 💡 Frontend Integration Tips

1.  **WithCredentials**: Always set `axios.defaults.withCredentials = true` for cookie-based auth.
2.  **Role-Based UI**: Use `user.role` from the login response to handle dashboard routing.
3.  **Images**: Use the returned Cloudinary URLs directly in `<img>` tags.
4.  **Pagination**: Use `totalCount` and `totalPages` from the API to build your pagination controls.

---

_Last Updated: March 2026_

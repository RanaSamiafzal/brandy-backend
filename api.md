# Brandy API Documentation 🚀

> Welcome, Frontend Developer! This document provides everything you need to integrate with the Brandy Backend.

---

## 🌐 Base URL

```
http://localhost:8000/api/v1
```

## 🔐 Authentication

We use **JWT (JSON Web Tokens)**. Tokens are stored in **HttpOnly Cookies** for security, but can also be passed via the `Authorization` header.

### Headers

```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <access_token>"
}
```

### Cookie Strategy

- `accessToken`: Short-lived (passed automatically with `withCredentials: true`)
- `refreshToken`: Long-lived (used to get a new `accessToken` when it expires)

---

## 👤 User & Auth Endpoints (`/users`)

### 1. Register

`POST /users/register` (Multipart/Form-Data)

| Field      | Type   | Required | Description             |
| ---------- | ------ | -------- | ----------------------- |
| fullname   | String | Yes      | User's full name        |
| email      | String | Yes      | Unique email address    |
| password   | String | Yes      | Min 6 characters        |
| role       | String | Yes      | `brand` or `influencer` |
| profilePic | File   | No       | Profile image           |
| coverPic   | File   | No       | Cover/Header image      |

### 2. Login

`POST /users/login`

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Success Response (200):** Sets `accessToken` & `refreshToken` cookies.

```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "fullname": "...", "role": "brand" },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

### 3. Profile & Security

- `GET /users/profile`: Get current user info (Requires Auth).
- `PATCH /users/update-profile`: Update details/images (Multipart).
- `POST /users/logout`: Clears cookies and sessions.
- `POST /users/forgot-password`: Send OTP to email.
- `POST /users/reset-password`: Reset using OTP (`email`, `otp`, `password`).

---

## 🏢 Brand Endpoints (`/brands`)

> [!IMPORTANT]
> All `/brands` routes require the user to have the `brand` role.

### 📊 Dashboard & Activity

- `GET /brands/dashboard`: High-level stats (Total campaigns, requests, etc.)
- `GET /brands/activities`: Notification/Activity feed (Paginated: `?page=1&limit=10`)

### 📢 Campaign Management

- `POST /brands/campaigns`: Create a campaign (**Title, Description, Budget{min,max}, Category[], Platform[]**).
- `GET /brands/campaigns`: List all brand's campaigns.
- `GET /brands/campaigns/:campaignId`: Detailed view of one campaign.
- `PUT /brands/campaigns/:campaignId`: Edit campaign details.
- `DELETE /brands/campaigns/:campaignId`: Soft delete.
- `PATCH /brands/campaigns/:campaignId/status`: Update status (`active`, `closed`, `completed`).

### 🔍 Influencer Discovery

- `GET /brands/influencers`: Search and filter influencers.
  - **Query Params:** `search`, `category`, `platform`, `minPrice`, `maxPrice`, `minFollowers`, `rating`, `location`, `sort`.
- `GET /brands/influencers/:influencerId`: Full influencer profile and platform stats.

### 🤝 Collaboration Requests

- `POST /brands/collaboration-requests`: Send request to an influencer.
  - **Body:** `{ influencerId, campaignId, note, proposedBudget }`
- `GET /brands/collaboration-requests`: List all sent requests (with filters).
- `GET /brands/collaboration-requests/:requestId`: Specific request details + Influencer/Campaign info.
- `PATCH /brands/collaboration-requests/:requestId/cancel`: Cancel a pending request.

---

## ⚠️ Error Handling

All errors follow this structure:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Detailed error message here"
}
```

| Code | Meaning                                                                |
| ---- | ---------------------------------------------------------------------- |
| 400  | Bad Request (Missing fields, validation error)                         |
| 401  | Unauthorized (Missing/Invalid token)                                   |
| 403  | Forbidden (Wrong role, e.g., influencer trying to access brand routes) |
| 404  | Not Found                                                              |
| 500  | Server Error                                                           |

---

## 🚀 Deployment (Vercel)

To deploy this backend on Vercel:

1. Ensure `vercel.json` is in your `server/` directory.
2. In Vercel Project Settings, set the **Root Directory** to `server`.
3. Add the required Environment Variables listed below.

### Needed Environment Variables

| Variable                | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| `PORT`                  | 8000                                                           |
| `MONGODB_URI`           | Your MongoDB connection string                                 |
| `ACCESS_TOKEN_SECRET`   | Long random string                                             |
| `REFRESH_TOKEN_SECRET`  | Long random string                                             |
| `CORS_ORIGIN`           | Your Frontend URL (e.g., `https://brandy-frontend.vercel.app`) |
| `NODE_ENV`              | Set to `production` (Enables secure cookies)                   |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary name                                                |
| `CLOUDINARY_API_KEY`    | Cloudinary API key                                             |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret                                          |
| `GOOGLE_CLIENT_ID`      | For Google OAuth                                               |
| `GOOGLE_CLIENT_SECRET`  | For Google OAuth                                               |

---

## 💡 Frontend Tips

1. **Axios Configuration**: Use `withCredentials: true` to ensure cookies are sent.
2. **SameSite Cookies**: In production, we use `SameSite: None` and `Secure`. Your frontend **must** use HTTPS for authentication to work.
3. **Role Redirects**: After login, check `data.user.role` to redirect to `/brand/dashboard` or `/influencer/dashboard`.
4. **Images**: All images are returned as Cloudinary URLs.
5. **Pagination**: Most list endpoints support `page` and `limit`. The response includes `totalPages` and `totalCount`.

---

_Last Updated: March 2026_

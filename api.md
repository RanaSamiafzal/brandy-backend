# Brandy API Documentation 🚀

> **Version 1.0.0** | Professional Brand-Influencer Integration Guide

---

## 🌐 Connectivity

- **Base URL**: `http://localhost:8000/api/v1`
- **Auth Strategy**: Cookie-based JWT (HttpOnly).
- **CORS**: Requires `withCredentials: true`.

---

## 📦 Standard Response Format

All responses follow this JSON structure:

```json
{
  "statusCode": 200,
  "data": { ... },
  "message": "Success message",
  "success": true
}
```

---

## 👤 Authentication & User (`/users`)

### 1. Register User

`POST /register` | Content-Type: `multipart/form-data`

| Field        | Type   | Required | Description                  |
| ------------ | ------ | -------- | ---------------------------- |
| `fullname`   | String | Yes      | User's full name             |
| `email`      | String | Yes      | Unique email                 |
| `password`   | String | Yes      | Min 6 characters             |
| `role`       | String | Yes      | `brand` or `influencer`      |
| `profilePic` | File   | No       | Aspect ratio 1:1 recommended |
| `coverPic`   | File   | No       | Banner image                 |

### 2. Login

`POST /login` | Content-Type: `application/json`

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### 3. Profile Management

- `GET /profile`: Get current user data.
- `PATCH /update-profile`: Update details (supports multipart for images).
- `POST /forgot-password`: Send 6-digit OTP to email.
- `POST /reset-password`: Reset using `email`, `otp`, and `password`.

---

## 🏢 Brand Management (`/brands`)

> **Note**: All routes below require `role: brand`.

### 1. Dashboard Basics

`GET /dashboard`
Returns aggregated stats for active campaigns, pending requests, and recent activity.

### 2. Campaign Lifecycle

- `POST /campaigns`: Create new campaign.
- `GET /campaigns`: List with filters (`search`, `status`, `minBudget`, `maxBudget`).
- `GET /campaigns/:id`: Detailed view including deliverables.
- `PUT /campaigns/:id`: Update campaign settings.
- `DELETE /campaigns/:id`: Soft delete.
- `PATCH /campaigns/:id/status`: Transition between `active`, `closed`, `completed`.

### 3. Influencer Discovery

`GET /influencers`
Advanced faceted search for influencers. Supports pagination and multi-dimensional filtering.

### 4. Collaboration Flows

- `POST /collaboration-requests`: Send a formal invite to an influencer.
- `GET /collaboration-requests`: Track all outgoing requests.
- `PATCH /collaboration-requests/:id/cancel`: Withdraw an active request.

---

## 🔔 Activity & Notifications

`GET /activities`
Paginated feed of system events. Includes `unreadCount`.

- `PATCH /activities/:id/mark-read`: Mark single notification as read.
- `DELETE /activities/:id/delete`: Remove from feed.

---

## 🛠 Frontend Integration Snippets

### Axios Global Config

```javascript
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000/api/v1",
  withCredentials: true, // CRITICAL: Enables cookie-based auth
});
```

### Handling Multi-part Forms (Registration)

```javascript
const formData = new FormData();
formData.append("fullname", "John Doe");
formData.append("profilePic", fileInput.files[0]);

await api.post("/users/register", formData);
```

---

## ⚠️ Error Reference

| Code    | Label        | Cause                                      |
| ------- | ------------ | ------------------------------------------ |
| **400** | Bad Request  | Validation failed or missing fields        |
| **401** | Unauthorized | Token expired or missing cookies           |
| **403** | Forbidden    | User role does not match route requirement |
| **404** | Not Found    | Resource or route does not exist           |
| **500** | Server Error | Unexpected backend failure                 |

---

_Last Updated: March 2026_

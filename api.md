# Brandy API Documentation 🚀

> **Version 1.2.0** | Professional Brand-Influencer Integration Guide

---

## 🌐 Connectivity

- **Base URL**: `http://localhost:8000/api/v1`
- **Auth Strategy**: Cookie-based JWT (HttpOnly).
- **CORS**: Requires `withCredentials: true`.

---

## 📦 Standard Response Format

### Single Resource / Simple Response
```json
{
  "success": true,
  "message": "Action successful",
  "data": { ... }
}
```

### Paginated List Response
```json
{
  "success": true,
  "message": "List fetched successfully",
  "total": 120,
  "page": 1,
  "pages": 12,
  "data": [ ... ]
}
```

---

## 🔎 Global Query Parameters (for Lists)

| Parameter | Type   | Default | Description             |
| ---------| ------ | ------- | ----------------------- |
| `page`    | Number | `1`     | Current page to fetch   |
| `limit`   | Number | `10`    | Items per page          |
| `search`  | String | -       | Keyword search filter   |
| `status`  | String | -       | Categorical filter      |

---

## 🔐 Authentication (`/auth`)

| Endpoint            | Method    | Description                                      |
| ------------------- | --------- | ------------------------------------------------ |
| `/register`         | `POST`    | Register as Brand/Influencer (Multipart)         |
| `/login`            | `POST`    | Login to account                                 |
| `/logout`           | `POST`    | Logout and clear cookies                         |
| `/refresh-token`    | `POST`    | Refresh access and refresh tokens                |
| `/profile`          | `GET`     | Get my authenticated profile data                |
| `/forgot-password`  | `POST`    | Send 6-digit OTP to email                        |
| `/reset-password`   | `POST`    | Reset password using OTP                         |
| `/google`           | `GET`     | Initiate Google OAuth flow                       |
| `/google/callback`  | `GET`     | Google OAuth callback                            |

---

## 👤 User Management (`/users`)

| Endpoint            | Method    | Description                                      |
| ------------------- | --------- | ------------------------------------------------ |
| `/profile`          | `PATCH`    | Update profile (Multipart: profilePic, coverPic, logo) |
| `/delete-account`   | `DELETE`   | Permanently delete account                       |

---

## 🏢 Brand Suite (`/brands`)

| Endpoint                     | Method    | Description                                      |
| --------------------------- | --------- | ------------------------------------------------ |
| `/dashboard`                | `GET`     | Brand specific performance stats                 |
| `/profile`                  | `GET`     | Get brand profile details                        |
| `/profile`                  | `PATCH`   | Update brand metadata & logo                     |
| `/change-password`          | `POST`    | Securely change current password                 |
| `/activity`                 | `GET`     | Paginated list of brand activities               |
| `/activity/:id/read`        | `PATCH`   | Mark notification as read                        |
| `/activity/:id`             | `DELETE`  | Remove activity from feed                        |
| `/influencers`              | `GET`     | Discover & search influencers                    |
| `/influencers/:id`          | `GET`     | View influencer profile (Brand view)             |

---

## 🎨 Influencer Suite (`/influencers`)

| Endpoint            | Method    | Description                                      |
| ------------------- | --------- | ------------------------------------------------ |
| `/dashboard`        | `GET`     | Influencer analytics & earnings                  |
| `/profile`          | `GET`     | Get influencer specific details                  |
| `/profile`          | `PATCH`   | Update bio, niche, and socials                   |

---

## 📢 Campaigns (`/campaigns`)

| Endpoint            | Method    | Description                                      |
| ------------------- | --------- | ------------------------------------------------ |
| `/`                 | `GET`     | List all campaigns (with filters)                |
| `/`                 | `POST`    | Create new campaign (Brand only)                 |
| `/:id`              | `GET`     | Full campaign brief & requirements               |
| `/:id`              | `PATCH`   | Update campaign settings                         |
| `/:id`              | `DELETE`  | Close/Delete campaign                            |

---

## 🤝 Collaboration Lifecycle

### Requests (`/collaboration-requests`)
- `POST /`: Send collaboration invite to influencer.
- `GET /`: List all incoming/outgoing requests.
- `GET /:id`: View request details.
- `PATCH /:id/accept`: Influencer accepts request.
- `PATCH /:id/reject`: Influencer rejects request.
- `PATCH /:id/cancel`: Brand withdraws request.

### Active Collaborations (`/collaborations`)
- `GET /`: List active collaborations.
- `GET /:id`: Full workspace details.
- `PATCH /:id/cancel`: Terminate collaboration.
- `PATCH /:id/complete`: Brand closes collaboration.
- `GET /:id/progress`: Completion percentage stats.

---

## ✅ Deliverables & Submissions

_All endpoints prefixed with `/collaborations/:id`_

| Endpoint                                 | Method    | Role         |
| --------------------------------------- | --------- | ------------ |
| `/deliverables`                         | `GET`     | Both         |
| `/deliverables`                         | `POST`    | Brand        |
| `/deliverables/:deliverableId`          | `PATCH`   | Influencer   |
| `/deliverables/:deliverableId`          | `DELETE`  | Brand        |
| `/deliverables/:deliverableId/submit`   | `POST`    | Influencer   |
| `/deliverables/:deliverableId/approve`  | `PATCH`   | Brand        |
| `/deliverables/:deliverableId/revision` | `PATCH`   | Brand        |

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

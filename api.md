# Brandly API Documentation 🚀

> **Version 1.3.0** | Professional Brand-Influencer Integration Guide

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

These routes handle user session management.

| Endpoint            | Method    | Auth Req? | Description                                      |
| ------------------- | --------- | --------- | ------------------------------------------------ |
| `/register`         | `POST`    | No        | Register as Brand/Influencer (Multipart Form Data)|
| `/login`            | `POST`    | No        | Login to account                                 |
| `/logout`           | `POST`    | Yes       | Logout and clear cookies                         |
| `/refresh-token`    | `POST`    | No        | Refresh access and refresh tokens                |
| `/profile`          | `GET`     | Yes       | Get my authenticated profile data                |
| `/forgot-password`  | `POST`    | No        | Send 6-digit OTP to email                        |
| `/reset-password`   | `POST`    | No        | Reset password using OTP                         |
| `/google`           | `GET`     | No        | Initiate Google OAuth flow                       |
| `/google/callback`  | `GET`     | No        | Google OAuth callback                            |

---

## 🏢 Brand Suite (`/brands`)

Requires `brand` role authentication.

| Endpoint                     | Method    | Description                                      |
| --------------------------- | --------- | ------------------------------------------------ |
| `/dashboard`                | `GET`     | Brand specific performance stats                 |
| `/profile`                  | `GET`     | Get brand profile details (with user data)       |
| `/profile`                  | `PATCH`   | Update brand metadata & logo                     |
| `/change-password`          | `POST`    | Securely change current password                 |
| `/activity`                 | `GET`     | Paginated list of brand activities               |
| `/activity/:id/read`        | `PATCH`   | Mark notification/activity as read               |
| `/activity/:id`             | `DELETE`  | Remove activity from feed                        |
| `/influencers`              | `GET`     | Discover & search influencers                    |
| `/influencers/:id`          | `GET`     | View influencer profile (Brand view)             |

---

## 🎨 Influencer Suite (`/influencers`)

Requires `influencer` role authentication.

| Endpoint            | Method    | Description                                      |
| ------------------- | --------- | ------------------------------------------------ |
| `/dashboard`        | `GET`     | Influencer analytics & earnings                  |
| `/profile`          | `GET`     | Get influencer specific details                  |
| `/profile`          | `PATCH`   | Update bio, niche, and socials                   |

---

## 📢 Campaigns (`/campaigns`)

Campaign management for brands and discovery for influencers.

| Endpoint            | Method    | Role         | Description                                      |
| ------------------- | --------- | ------------ | ------------------------------------------------ |
| `/`                 | `GET`     | All          | List all campaigns (with filters)                |
| `/`                 | `POST`    | Brand        | Create new campaign                              |
| `/:id`              | `GET`     | All          | Full campaign brief & requirements               |
| `/:id`              | `PATCH`   | Brand        | Update campaign settings                         |
| `/:id`              | `DELETE`  | Brand        | Close/Delete campaign                            |

---

## 🤝 Collaboration Lifecycle

### Requests (`/collaboration-requests`)
| Endpoint            | Method    | Description                                      |
| ------------------- | --------- | ------------------------------------------------ |
| `/`                 | `POST`    | Send collaboration invite to influencer          |
| `/`                 | `GET`     | List all incoming/outgoing requests              |
| `/:id`              | `GET`     | View request details                             |
| `/:id/accept`       | `PATCH`   | Influencer accepts request                       |
| `/:id/reject`       | `PATCH`   | Influencer rejects request                       |
| `/:id/cancel`       | `PATCH`   | Brand withdraws request                          |

- `GET /`: List active collaborations.
- `GET /:id`: Full workspace details.
- `POST /:id/confirm-agreement`: Sign the collaboration contract (Both parties).
- `POST /:id/fund-escrow`: Initialize Stripe escrow funding (Brand only).
- `POST /:id/sync-escrow`: Manually trigger status sync with Stripe.
- `POST /:id/request-action`: Request project `CANCEL` or `COMPLETE` (Mutual approval required).
- `POST /:id/handle-action`: Approve or Reject a pending project action.
- `GET /:id/progress`: Completion percentage & budget stats.

---

## ⚡ Real-Time Events (Socket.io)

Clients should join the project room upon entering the dashboard: `socket.emit('join chat', collaborationId)`.

| Event | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `activity_created` | Server -> Client | `{ type, category, relatedId }` | New notification/activity alert. |
| `deliverable_updated`| Server -> Client | `{ collaborationId, deliverableId, status }` | Task board update (Silent). |
| `collaboration_updated`| Server -> Client | `{ collaborationId, status }` | Project status/agreement update. |

---

## ✅ Deliverables & Submissions

_All endpoints prefixed with `/collaborations/:id`_

| Endpoint                                 | Method    | Role         | Description                  |
| --------------------------------------- | --------- | ------------ | ---------------------------- |
| `/deliverables`                         | `GET`     | Both         | List all deliverables        |
| `/deliverables`                         | `POST`    | Brand        | Create a new deliverable     |
| `/deliverables/:deliverableId`          | `PATCH`   | Influencer   | Update deliverable status    |
| `/deliverables/:deliverableId`          | `DELETE`  | Brand        | Delete deliverable           |
| `/deliverables/:deliverableId/submit`   | `POST`    | Influencer   | Submit work for review       |
| `/deliverables/:deliverableId/approve`  | `PATCH`   | Brand        | Approve submission           |
| `/deliverables/:deliverableId/revision` | `PATCH`   | Brand        | Request revision             |

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

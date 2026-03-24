# Brandy - Project Context & Release Documentation 🚀

> **AI Agent Context**: This document is designed to provide a comprehensive overview of the Brandy platform for both development and AI-assisted engineering.

## 🏗 System Architecture & Overview

**Brandy** is a premium brand-influencer collaboration platform built with a robust Node.js/Express backend. It follows a modular MVC Richardson maturity model for RESTful APIs.

### Core Entities & Relationships

- **User**: Base identity model (influencer or brand). Handles authentication and basic profile data.
- **Brand**: Profile extension for brand-type users. Owns campaigns.
- **Influencer**: Profile extension for influencer-type users. Discovered by brands.
- **Campaign**: Marketing initiatives created by Brands. Contains budget, requirements, and status.
- **CollaborationRequest**: The bridge between a Brand and an Influencer for a specific Campaign.
- **Activity**: System-wide event logging for notifications and audit trails.

---

## 🛠 Design Patterns & Conventions

### 1. Request Handling

We use a centralized `AsyncHandler` wrapper for all controller functions to eliminate `try-catch` boilerplate and ensure consistent error propagation.

### 2. Standardized Responses

- **Success**: `ApiResponse(statusCode, data, message)`
- **Errors**: `ApiError(statusCode, message, errors, stack)`

### 3. Middleware Stack

- `verifyJwt`: Authentication guard (Cookie & Header support).
- `roleMiddleware`: Authorization guard (e.g., `roleMiddleware("brand")`).
- `upload`: Multer-based file processing (Cloudinary integration).

---

## ✅ Current Implementation State

### Done

- **Authentication Suite**: JWT session management, Google OAuth 2.0, OTP-based password recovery.
- **Brand Tools**: Full Campaign CRUD, Dashboard Analytics, and faceted Influencer Discovery.
- **Collaboration Lifecycle**: End-to-end multi-stage workflow (Request → Acceptance → Active Collaboration).
- **Deliverables Engine**: Task management within collaborations involving Brand approval and Influencer submissions.
- **Activity & Notifications**: Centralized event logging with "Mark as Read" and "Delete" capabilities.
- **Route Consolidation**: Major refactor consolidating legacy `userRoute.js`/`brandRoute.js` into modular `userRoutes.js`/`brandRoutes.js`.
- **Cloudinary Integration**: Automated image processing for profile/campaign media.

### In Progress

- **Performance Analytics**: Advanced reporting for influencer campaign ROI.
- **Security Audit**: Finalizing rate-limiting and enhanced validation for high-traffic endpoints.
- **Social Integration**: Deep linking with Instagram/TikTok APIs for real-time stat verification.

---

## 📂 Project Navigation (server/src/)

- `controllers/`: Business logic layer.
- `models/`: Mongoose schemas with advanced index optimization.
- `routes/`: Express router definitions (Modularized architecture).
- `middleware/`: Auth, role-based guards, and Multer processing.
- `config/`: System-wide configurations (DB, Cloudinary, Passport).
- `utils/`: Shared helper classes, `ApiResponse`, and `Asynchandler`.

---

## ⚙️ Development Environment

### Scripts

- `npm start`: Production server launch.
- `npm run dev`: Development server with live reload and dotenv support.

---

## 🚀 Backend Performance & Reliability (Refactor Phase)

### Optimizations
- **Global Error Handling**: Integrated a centralized middleware to intercept all controller/middleware errors, providing consistent JSON responses and safe stack traces in development.
- **Mongoose Indexing**: Strategic indexes added for `email`, `role`, `status`, `brand`, and `influencer` fields across core models, significantly reducing query latency.
- **Aggregated Pagination**: Replaced standard find queries with efficient `$facet` aggregation pipelines, allowing data fetching and total count calculations in a single database roundtrip.
- **Memory Management**: Implemented `.lean()` across discovery and dashboard endpoints to minimize Mongoose document overhead for read-only operations.
- **Standardized Communication**: Unified all API responses via `ApiResponse` and `ApiError` utilities for predictable frontend integration.

---

_Last Updated: March 13, 2026_

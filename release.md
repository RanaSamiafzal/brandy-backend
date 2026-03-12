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

- **Authentication**: JWT-based session management, Google OAuth 2.0.
- **Brand Suite**: Full CRUD for Campaigns, Dashboard Analytics, and Influencer Discovery.
- **Communication**: Collaboration request lifecycle (Send/Cancel).
- **Storage**: Automated image optimization via Cloudinary.

### In Progress

- **Influencer Dashboard**: Finalizing controller mappings for performance analytics.
- **Settings**: Extended profile management (Security, Social Links).
- **Notifications**: "Mark as read" and "Delete" actions for Activities.

---

## 📂 Project Navigation (server/src/)

- `controllers/`: Business logic layer.
- `models/`: Mongoose schemas and hooks.
- `routes/`: Express router definitions.
- `middleware/`: Auth and utility guards.
- `config/`: System-wide configurations (DB, Cloudinary).
- `utils/`: Shared helper classes and constants.

---

## ⚙️ Development Environment

### Scripts

- `npm start`: Production server launch.
- `npm run dev`: Development server with live reload and dotenv support.

### Key Dependencies

- `express`: Web framework.
- `mongoose`: MongoDB ODM.
- `cloudinary`: Image hosting.
- `passport-google-oauth20`: Social authentication.

---

_Last Updated: March 2026_

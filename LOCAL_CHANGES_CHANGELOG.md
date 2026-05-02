# Backend Local Changes & Features Changelog

*This document tracks all the local backend architectural changes, feature implementations, and bug fixes made **before** pulling and merging the remote changes. This reference is crucial during testing and verification to ensure no logic or features were accidentally removed or overwritten due to merge conflicts.*

## 1. Unified Collaboration Model Architecture
- **Removed `CollaborationRequest` Model**: Consolidated the collaboration request logic entirely into a single `Collaboration` model to reduce database complexity and duplication.
- **Field Refactoring**: Replaced ambiguous `sender` and `receiver` fields with explicit `brand` and `influencer` ObjectIds.
- **Status Enum Updates**: Changed the initial status enum from `pending` to `requested`. The complete collaboration lifecycle now flows clearly through one unified collection.
- **Route & Controller Updates**: Updated all routes, controllers, and services (including `campaign.service.js`, `influencer.service.js`, and `brand.service.js`) to point to the new `Collaboration` model, completely dropping the old `CollaborationRequest` imports.

## 2. Status Synchronization (Campaigns & Collaborations)
- **1-to-1 Status Sync**: Implemented logic in `collaboration.service.js` so that whenever a collaboration's status changes (e.g., to active, completed, or cancelled), the linked Campaign's status automatically updates to match it exactly.
- **Status Enum Cleanup**: Removed the redundant `suspended` status and formally added `review` to the campaign statuses to better reflect the collaboration lifecycle.

## 3. Stripe Escrow & Milestone Payments Integration
- **New Modules Created**: Added a complete backend infrastructure for payments (`payment.model.js`, `escrow.model.js`, `stripe.service.js`, `stripe.controller.js`, and `stripe.routes.js`).
- **Escrow Workflow**: Implemented a secure task-based payment system using Stripe Connect. When a brand accepts an influencer's request, funds are required to be placed into escrow via a Stripe Checkout session.
- **Webhooks Handling**: Implemented a secure webhook listener endpoint (`/api/v1/payment/webhook`) to automatically mark escrows as funded and trigger the start of deliverables upon successful payment intents.
- **Deliverable Payouts**: Added functionality to release funds to influencers progressively based on approved deliverables.

## 4. Advanced Collaboration Workflow & Constraints
- **Restricted Cancellation Flow**: Modified `updateCollaborationStatus` to forbid influencers from initiating direct cancellations on active collaborations. Cancellation is now exclusively a brand privilege to protect escrow integrity.
- **Cancellation Reasons**: Implemented a mandatory `cancellationReason` field that saves to the `Collaboration` model and automatically triggers an activity notification to the influencer explaining why the project was terminated.
- **Escrow Protection**: Added validation ensuring that brands cannot arbitrarily cancel a collaboration if there are ongoing or submitted tasks that need to be resolved or paid out first.
- **Turn-based Negotiation Logic**: Enhanced the `isCounterOffer` and `needsAction` flags for UI feedback, and added strict filters to block requests for deleted or missing campaigns.

## 5. Database & Environment Fixes
- **Index Cleanup**: Identified and dropped a stale `request_1` unique index on the `collaborations` MongoDB collection that was causing critical `E11000 duplicate key` runtime errors.
- **Notification System**: Built a robust new notification module (`notification.model.js`, `notification.service.js`, `notification.controller.js`) to support the new unified workflow and alert users of status changes, cancellations, and escrow updates instantly.

---

### Verification Checklist for Post-Merge Testing
When verifying the successfully merged codebase, please run through this checklist to ensure all local changes survived the merge:
- [ ] **Collaboration Creation**: Submitting a collaboration request creates a `Collaboration` document (the `CollaborationRequest` model should no longer exist).
- [ ] **Escrow Payment**: Accepting a collaboration forces an Escrow Stripe Checkout session and webhook fulfillment.
- [ ] **Syncing**: Completing or Canceling a collaboration successfully propagates the exact status to the corresponding Campaign.
- [ ] **Permissions**: Influencers cannot cancel an active collaboration; Brands can only cancel if there are no pending tasks.
- [ ] **Database Integrity**: The `E11000 duplicate key` error no longer occurs on new collaboration requests.

// =============================================================================
// Admin Authorization Middleware
// =============================================================================
// Simple admin check: compares the authenticated user's ID against the
// configured ADMIN_USER_ID environment variable.
//
// For MVP, there's exactly one admin (the developer). No roles table,
// no RBAC system, no permission matrix — just a single ID check.
//
// This middleware must be used AFTER requireAuth (which sets req.userId).
//
// Usage in routes:
//   router.post("/", requireAuth, requireAdmin, async (req, res) => { ... })
//
// To set the admin user ID:
//   1. Create an account via /api/auth/signup
//   2. Find your user_id in the DynamoDB users table
//   3. Set it in Terraform: admin_user_id = "your-uuid"
//   4. Redeploy (terraform apply → Lambda env var updated)
//
// For local development, set ADMIN_USER_ID in your .env file.
// =============================================================================

import config from "../config.js";

/**
 * Middleware that restricts access to admin-only endpoints.
 * Returns 403 Forbidden if the authenticated user is not the admin.
 *
 * Must be used after requireAuth middleware (needs req.userId to be set).
 */
export function requireAdmin(req, res, next) {
  // If no admin user is configured, reject all admin requests.
  // This prevents accidental admin access in misconfigured environments.
  if (!config.adminUserId) {
    return res.status(403).json({
      detail: "Admin access is not configured. Set ADMIN_USER_ID environment variable.",
    });
  }

  if (req.userId !== config.adminUserId) {
    return res.status(403).json({ detail: "Admin access required" });
  }

  next();
}

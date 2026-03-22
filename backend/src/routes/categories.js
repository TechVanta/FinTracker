// =============================================================================
// Category Routes — /api/categories
// =============================================================================
// Admin-managed CRUD for the dynamic spending category system.
//
// GET  /api/categories          — List all active categories (any authenticated user)
// POST /api/categories          — Create a new category (admin only)
// PATCH /api/categories/:id     — Update a category (admin only)
// DELETE /api/categories/:id    — Soft-delete a category (admin only)
// POST /api/categories/seed     — Manually trigger category seeding (admin only)
//
// Categories are the foundation of the categorization pipeline — they define
// what spending buckets exist and carry the keywords used by Layer 2 matching.
// =============================================================================

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import {
  listCategories,
  addCategory,
  editCategory,
  removeCategory,
  seedCategories,
  seedSubcategories,
} from "../services/categoryService.js";

const router = Router();

/**
 * GET /api/categories
 * List all active categories. Available to any authenticated user.
 * Used by the frontend for category dropdowns, filters, and charts.
 *
 * Query params:
 *   includeInactive=true — Include soft-deleted categories (admin use)
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const categories = await listCategories({ includeInactive });
    return res.json(categories);
  } catch (err) {
    console.error("List categories error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * POST /api/categories
 * Create a new spending category. Admin only.
 *
 * Body: { name, parent_id?, icon?, color?, keywords?, sort_order? }
 */
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, parent_id, icon, color, keywords, sort_order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ detail: "Category name is required" });
    }

    const category = await addCategory({
      name: name.trim(),
      parent_id,
      icon,
      color,
      keywords: keywords || [],
      sort_order,
    });

    return res.status(201).json(category);
  } catch (err) {
    console.error("Create category error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * PATCH /api/categories/:id
 * Update an existing category. Admin only.
 * Only the provided fields are updated — others remain unchanged.
 *
 * Body: { name?, icon?, color?, keywords?, sort_order?, is_active? }
 */
router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const allowedFields = ["name", "icon", "color", "keywords", "sort_order", "is_active", "parent_id"];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ detail: "No valid fields to update" });
    }

    const updated = await editCategory(req.params.id, updates);
    return res.json(updated);
  } catch (err) {
    console.error("Update category error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * DELETE /api/categories/:id
 * Soft-delete a category (sets is_active = false). Admin only.
 * Existing transactions keep their category — it just won't appear
 * in the active list for new transactions.
 */
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const deactivated = await removeCategory(req.params.id);
    return res.json(deactivated);
  } catch (err) {
    console.error("Delete category error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * POST /api/categories/seed
 * Manually trigger the category seeding process. Admin only.
 * This is normally called automatically on first deploy, but can be
 * triggered manually if the table needs to be re-populated.
 */
router.post("/seed", requireAuth, requireAdmin, async (req, res) => {
  try {
    const count = await seedCategories();
    return res.json({
      message: count > 0 ? `Seeded ${count} categories` : "Categories already exist, skipped",
      count,
    });
  } catch (err) {
    console.error("Seed categories error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * POST /api/categories/seed-subcategories
 * Add subcategories to existing parent categories. Admin only.
 * Use this on deployments that were set up before subcategories were added.
 * Also adds any new parent categories (e.g., Investment) that don't exist yet.
 * Safe to call multiple times — skips categories that already exist.
 */
router.post("/seed-subcategories", requireAuth, requireAdmin, async (req, res) => {
  try {
    const count = await seedSubcategories();
    return res.json({
      message: count > 0 ? `Added ${count} subcategories` : "All subcategories already exist",
      count,
    });
  } catch (err) {
    console.error("Seed subcategories error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

export default router;

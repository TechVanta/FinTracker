// =============================================================================
// Merchant Mapping Routes — /api/merchants
// =============================================================================
// Admin interface for managing the merchant → category mapping table.
//
// GET    /api/merchants              — List all merchant mappings (admin only)
// POST   /api/merchants              — Create a merchant mapping (admin only)
// PATCH  /api/merchants/:pattern     — Update a mapping's category (admin only)
// DELETE /api/merchants/:pattern     — Delete a merchant mapping (admin only)
// POST   /api/merchants/seed         — Manually trigger merchant seeding (admin only)
//
// The merchant mapping table is the first layer of the categorization pipeline.
// It maps normalized merchant names to categories. The more complete this table,
// the fewer LLM calls are needed — which keeps costs at $0.
// =============================================================================

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import {
  listMerchantMappings,
  addMerchantMapping,
  updateMerchantMappingCategory,
  removeMerchantMapping,
  seedMerchantMappings,
} from "../services/merchantService.js";

const router = Router();

/**
 * GET /api/merchants
 * List all merchant mappings, sorted by match_count (most-used first).
 * Admin only — this data is internal to the categorization engine.
 */
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const mappings = await listMerchantMappings();
    return res.json(mappings);
  } catch (err) {
    console.error("List merchants error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * POST /api/merchants
 * Create a new merchant → category mapping. Admin only.
 *
 * Body: { merchant_pattern, category }
 *   - merchant_pattern: The normalized merchant name (e.g., "tim hortons")
 *   - category: The category name to map to (e.g., "Dining")
 */
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { merchant_pattern, category } = req.body;

    if (!merchant_pattern || !category) {
      return res.status(400).json({
        detail: "merchant_pattern and category are required",
      });
    }

    const mapping = await addMerchantMapping(merchant_pattern, category);
    return res.status(201).json(mapping);
  } catch (err) {
    console.error("Create merchant mapping error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * PATCH /api/merchants/:pattern
 * Update the category for an existing merchant mapping. Admin only.
 * The :pattern param is URL-encoded (e.g., "tim%20hortons").
 *
 * Body: { category }
 */
router.patch("/:pattern", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { category } = req.body;
    const pattern = decodeURIComponent(req.params.pattern);

    if (!category) {
      return res.status(400).json({ detail: "category is required" });
    }

    const mapping = await updateMerchantMappingCategory(pattern, category);
    return res.json(mapping);
  } catch (err) {
    console.error("Update merchant mapping error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * DELETE /api/merchants/:pattern
 * Remove a merchant mapping. Admin only.
 * The :pattern param is URL-encoded.
 */
router.delete("/:pattern", requireAuth, requireAdmin, async (req, res) => {
  try {
    const pattern = decodeURIComponent(req.params.pattern);
    const deleted = await removeMerchantMapping(pattern);

    if (!deleted) {
      return res.status(404).json({ detail: "Merchant mapping not found" });
    }

    return res.json({ message: "Deleted", pattern });
  } catch (err) {
    console.error("Delete merchant mapping error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * POST /api/merchants/seed
 * Manually trigger the merchant mapping seeding process. Admin only.
 * Seeds ~300+ Canadian merchants with their category mappings.
 */
router.post("/seed", requireAuth, requireAdmin, async (req, res) => {
  try {
    const count = await seedMerchantMappings();
    return res.json({
      message: count > 0 ? `Seeded ${count} merchant mappings` : "Merchants already exist, skipped",
      count,
    });
  } catch (err) {
    console.error("Seed merchants error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

export default router;

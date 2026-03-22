/**
 * Merchants API — Admin interface for merchant → category mappings.
 *
 * The merchant mapping table is the first layer of the categorization
 * pipeline. Admin can view, add, edit, and delete mappings here.
 */

import apiClient from "./client";

/** A merchant → category mapping record */
export interface MerchantMapping {
  merchant_pattern: string;
  category_id: string;
  source: string; // "seed" | "admin" | "user_correction" | "llm_cache"
  match_count: number;
  created_at: string;
  updated_at: string;
}

/** Fetch all merchant mappings (admin only, sorted by match_count) */
export async function fetchMerchantMappings(): Promise<MerchantMapping[]> {
  const { data } = await apiClient.get<MerchantMapping[]>("/merchants");
  return data;
}

/** Create a new merchant mapping (admin only) */
export async function createMerchantMapping(
  merchantPattern: string,
  category: string
): Promise<MerchantMapping> {
  const { data } = await apiClient.post<MerchantMapping>("/merchants", {
    merchant_pattern: merchantPattern,
    category,
  });
  return data;
}

/** Update a merchant mapping's category (admin only) */
export async function updateMerchantMapping(
  merchantPattern: string,
  category: string
): Promise<MerchantMapping> {
  const { data } = await apiClient.patch<MerchantMapping>(
    `/merchants/${encodeURIComponent(merchantPattern)}`,
    { category }
  );
  return data;
}

/** Delete a merchant mapping (admin only) */
export async function deleteMerchantMapping(
  merchantPattern: string
): Promise<void> {
  await apiClient.delete(
    `/merchants/${encodeURIComponent(merchantPattern)}`
  );
}

/** Trigger merchant seeding (admin only) */
export async function seedMerchants(): Promise<{ message: string; count: number }> {
  const { data } = await apiClient.post<{ message: string; count: number }>(
    "/merchants/seed"
  );
  return data;
}

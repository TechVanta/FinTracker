/**
 * Categories API — Fetch and manage spending categories.
 *
 * Categories are dynamic and admin-managed. Regular users can only read them
 * (for dropdowns and filters). Admin users can create, update, and delete.
 */

import apiClient from "./client";

/** A spending category (e.g., Groceries, Dining, Transportation) */
export interface Category {
  category_id: string;
  name: string;
  parent_id: string | null;
  icon: string;
  color: string;
  keywords: string[];
  is_active: boolean;
  sort_order: number;
}

/** Fetch all active categories (sorted by sort_order) */
export async function fetchCategories(): Promise<Category[]> {
  const { data } = await apiClient.get<Category[]>("/categories");
  return data;
}

/** Fetch all categories including inactive ones (admin view) */
export async function fetchAllCategories(): Promise<Category[]> {
  const { data } = await apiClient.get<Category[]>("/categories", {
    params: { includeInactive: "true" },
  });
  return data;
}

/** Create a new category (admin only) */
export async function createCategory(
  category: Partial<Category>
): Promise<Category> {
  const { data } = await apiClient.post<Category>("/categories", category);
  return data;
}

/** Update an existing category (admin only) */
export async function updateCategory(
  categoryId: string,
  updates: Partial<Category>
): Promise<Category> {
  const { data } = await apiClient.patch<Category>(
    `/categories/${categoryId}`,
    updates
  );
  return data;
}

/** Soft-delete a category (admin only) */
export async function deleteCategory(categoryId: string): Promise<void> {
  await apiClient.delete(`/categories/${categoryId}`);
}

/** Trigger category seeding (admin only) */
export async function seedCategories(): Promise<{ message: string; count: number }> {
  const { data } = await apiClient.post<{ message: string; count: number }>(
    "/categories/seed"
  );
  return data;
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  seedCategories,
  type Category,
} from "@/api/categories";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";

/** Default values for the category form */
const EMPTY_FORM: CategoryFormData = {
  name: "",
  icon: "",
  color: "#6366f1",
  keywords: "",
  sort_order: 0,
};

interface CategoryFormData {
  name: string;
  icon: string;
  color: string;
  keywords: string; // comma-separated
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Inline form used for both creating and editing categories
// ---------------------------------------------------------------------------
function CategoryForm({
  initial = EMPTY_FORM,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
}: {
  initial?: CategoryFormData;
  onSubmit: (data: CategoryFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<CategoryFormData>(initial);

  const set = (field: keyof CategoryFormData, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <tr className="bg-primary-50/40">
      <td className="py-3 px-2">
        <Input
          placeholder="Category name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </td>
      <td className="py-3 px-2">
        <Input
          placeholder="e.g. utensils"
          value={form.icon}
          onChange={(e) => set("icon", e.target.value)}
        />
      </td>
      <td className="py-3 px-2">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={form.color}
            onChange={(e) => set("color", e.target.value)}
            className="h-8 w-8 rounded border border-gray-300 cursor-pointer"
          />
          <Input
            placeholder="#hex"
            value={form.color}
            onChange={(e) => set("color", e.target.value)}
            className="!w-24"
          />
        </div>
      </td>
      <td className="py-3 px-2">
        <Input
          placeholder="food, restaurant, ..."
          value={form.keywords}
          onChange={(e) => set("keywords", e.target.value)}
        />
      </td>
      <td className="py-3 px-2">
        <Input
          type="number"
          value={String(form.sort_order)}
          onChange={(e) => set("sort_order", Number(e.target.value))}
          className="!w-20"
        />
      </td>
      {/* status column — not editable in create/edit */}
      <td className="py-3 px-2" />
      <td className="py-3 px-2">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => onSubmit(form)}
            loading={isSubmitting}
            className="text-xs"
          >
            {submitLabel}
          </Button>
          <Button variant="secondary" onClick={onCancel} className="text-xs">
            Cancel
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();

  // --- Data fetching ---
  const {
    data: categories,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: fetchAllCategories,
  });

  // --- UI state ---
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- Mutations ---
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-categories"] });

  const createMut = useMutation({
    mutationFn: (data: CategoryFormData) =>
      createCategory({
        name: data.name,
        icon: data.icon,
        color: data.color,
        keywords: data.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        sort_order: data.sort_order,
      }),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: CategoryFormData;
    }) =>
      updateCategory(id, {
        name: data.name,
        icon: data.icon,
        color: data.color,
        keywords: data.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        sort_order: data.sort_order,
      }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: invalidate,
  });

  const seedMut = useMutation({
    mutationFn: seedCategories,
    onSuccess: invalidate,
  });

  // --- Helpers ---
  const toFormData = (cat: Category): CategoryFormData => ({
    name: cat.name,
    icon: cat.icon,
    color: cat.color,
    keywords: Array.isArray(cat.keywords) ? cat.keywords.join(", ") : "",
    sort_order: cat.sort_order,
  });

  // --- Render ---
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <p className="text-sm text-red-600 text-center py-4">
          Failed to load categories. Please try again.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => seedMut.mutate()}
            loading={seedMut.isPending}
          >
            Seed Categories
          </Button>
          <Button onClick={() => setShowCreate(true)} disabled={showCreate}>
            New Category
          </Button>
        </div>
      </div>

      {/* Seed result feedback */}
      {seedMut.isSuccess && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          {seedMut.data.message} ({seedMut.data.count} categories)
        </p>
      )}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Icon</th>
                <th className="pb-2 font-medium">Color</th>
                <th className="pb-2 font-medium">Keywords</th>
                <th className="pb-2 font-medium">Order</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Inline create form */}
              {showCreate && (
                <CategoryForm
                  onSubmit={(data) => createMut.mutate(data)}
                  onCancel={() => setShowCreate(false)}
                  isSubmitting={createMut.isPending}
                  submitLabel="Create"
                />
              )}

              {categories?.map((cat) =>
                editingId === cat.category_id ? (
                  // Inline edit form
                  <CategoryForm
                    key={cat.category_id}
                    initial={toFormData(cat)}
                    onSubmit={(data) =>
                      updateMut.mutate({ id: cat.category_id, data })
                    }
                    onCancel={() => setEditingId(null)}
                    isSubmitting={updateMut.isPending}
                    submitLabel="Save"
                  />
                ) : (
                  // Normal row
                  <tr key={cat.category_id} className="hover:bg-gray-50">
                    <td className="py-3 px-2 font-medium text-gray-900">
                      {cat.name}
                    </td>
                    <td className="py-3 px-2 text-gray-600">{cat.icon}</td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-5 w-5 rounded border border-gray-200"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-gray-500 text-xs font-mono">
                          {cat.color}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-gray-600 max-w-[200px] truncate">
                      {(cat.keywords?.length ?? 0)} keyword{(cat.keywords?.length ?? 0) !== 1 && "s"}
                    </td>
                    <td className="py-3 px-2 text-gray-600">{cat.sort_order}</td>
                    <td className="py-3 px-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          cat.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {cat.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                          onClick={() => setEditingId(cat.category_id)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                          onClick={() => {
                            if (confirm(`Delete "${cat.name}"?`)) {
                              deleteMut.mutate(cat.category_id);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>

          {(!categories || categories.length === 0) && !showCreate && (
            <p className="text-sm text-gray-500 text-center py-8">
              No categories found. Seed some default categories to get started.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

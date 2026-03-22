import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchMerchantMappings,
  createMerchantMapping,
  deleteMerchantMapping,
  seedMerchants,
} from "@/api/merchants";
import { fetchCategories, type Category } from "@/api/categories";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";

/** Number of rows to show per page */
const PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Inline form for creating a new merchant mapping
// ---------------------------------------------------------------------------
function MerchantForm({
  categories,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  categories: Category[];
  onSubmit: (pattern: string, categoryId: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState(
    categories.length > 0 ? categories[0]!.category_id : ""
  );

  return (
    <tr className="bg-primary-50/40">
      <td className="py-3 px-2">
        <Input
          placeholder="e.g. amazon, swiggy"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        />
      </td>
      <td className="py-3 px-2">
        <select
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          {categories.map((cat) => (
            <option key={cat.category_id} value={cat.category_id}>
              {cat.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-3 px-2" /> {/* source — auto-set */}
      <td className="py-3 px-2" /> {/* match_count — auto-set */}
      <td className="py-3 px-2">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              if (pattern.trim()) onSubmit(pattern.trim(), categoryId);
            }}
            loading={isSubmitting}
            className="text-xs"
          >
            Create
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
export default function AdminMerchantsPage() {
  const queryClient = useQueryClient();

  // --- Data fetching ---
  const {
    data: merchants,
    isLoading: merchantsLoading,
    isError: merchantsError,
  } = useQuery({
    queryKey: ["admin-merchants"],
    queryFn: fetchMerchantMappings,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetchCategories(),
  });

  // --- UI state ---
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // --- Build a category lookup for displaying names ---
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.category_id, c.name));
    return map;
  }, [categories]);

  // --- Filter + paginate ---
  const filtered = useMemo(() => {
    if (!merchants) return [];
    if (!search.trim()) return merchants;
    const q = search.toLowerCase();
    return merchants.filter((m) =>
      m.merchant_pattern.toLowerCase().includes(q)
    );
  }, [merchants, search]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // --- Mutations ---
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-merchants"] });

  const createMut = useMutation({
    mutationFn: ({ pattern, category }: { pattern: string; category: string }) =>
      createMerchantMapping(pattern, category),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteMerchantMapping,
    onSuccess: invalidate,
  });

  const seedMut = useMutation({
    mutationFn: seedMerchants,
    onSuccess: invalidate,
  });

  // --- Render ---
  if (merchantsLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (merchantsError) {
    return (
      <Card>
        <p className="text-sm text-red-600 text-center py-4">
          Failed to load merchant mappings. Please try again.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Merchant Mappings</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => seedMut.mutate()}
            loading={seedMut.isPending}
          >
            Seed Merchants
          </Button>
          <Button onClick={() => setShowCreate(true)} disabled={showCreate}>
            New Mapping
          </Button>
        </div>
      </div>

      {/* Seed result feedback */}
      {seedMut.isSuccess && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          {seedMut.data.message} ({seedMut.data.count} mappings)
        </p>
      )}

      {/* Search filter */}
      <div className="max-w-sm">
        <Input
          placeholder="Filter by merchant pattern..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(PAGE_SIZE); // reset pagination on filter change
          }}
        />
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">Merchant Pattern</th>
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 font-medium text-right">Matches</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Inline create form */}
              {showCreate && (
                <MerchantForm
                  categories={categories}
                  onSubmit={(pattern, category) =>
                    createMut.mutate({ pattern, category })
                  }
                  onCancel={() => setShowCreate(false)}
                  isSubmitting={createMut.isPending}
                />
              )}

              {visible.map((m) => (
                <tr key={m.merchant_pattern} className="hover:bg-gray-50">
                  <td className="py-3 px-2 font-medium text-gray-900 font-mono text-xs">
                    {m.merchant_pattern}
                  </td>
                  <td className="py-3 px-2 text-gray-700">
                    {categoryMap.get(m.category_id) ?? m.category_id}
                  </td>
                  <td className="py-3 px-2">
                    <SourceBadge source={m.source} />
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-gray-600">
                    {m.match_count}
                  </td>
                  <td className="py-3 px-2">
                    <button
                      className="text-xs text-red-600 hover:text-red-800 font-medium"
                      onClick={() => {
                        if (confirm(`Delete mapping "${m.merchant_pattern}"?`)) {
                          deleteMut.mutate(m.merchant_pattern);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && !showCreate && (
            <p className="text-sm text-gray-500 text-center py-8">
              {search
                ? "No merchants match your filter."
                : "No merchant mappings found. Seed some defaults to get started."}
            </p>
          )}
        </div>

        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center pt-4">
            <Button
              variant="secondary"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            >
              Load More ({filtered.length - visibleCount} remaining)
            </Button>
          </div>
        )}

        {/* Count summary */}
        {filtered.length > 0 && (
          <p className="text-xs text-gray-400 pt-3">
            Showing {Math.min(visibleCount, filtered.length)} of{" "}
            {filtered.length} mapping{filtered.length !== 1 && "s"}
            {search && ` (filtered from ${merchants?.length ?? 0} total)`}
          </p>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helper: badge for the mapping source
// ---------------------------------------------------------------------------
function SourceBadge({ source }: { source: string }) {
  const styles: Record<string, string> = {
    seed: "bg-blue-100 text-blue-800",
    admin: "bg-purple-100 text-purple-800",
    user_correction: "bg-yellow-100 text-yellow-800",
    llm_cache: "bg-gray-100 text-gray-600",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        styles[source] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {source}
    </span>
  );
}

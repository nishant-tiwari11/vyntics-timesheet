"use client";

import { useRouter } from "next/navigation";
import { FormField, Select } from "../../_components/Fields";
import {
  PAGE_SIZES,
  RANGES,
  STATUS_FILTERS,
  logHref,
  type LogQuery,
  type RangeId,
  type StatusFilter,
} from "./logQuery";

// Dropdowns that change the table straight away. Changing a filter goes back to page 1.

export function LogFilters({ query }: { query: LogQuery }) {
  const router = useRouter();
  return (
    <div className="ts-selects">
      <FormField label="Filter by time" srOnlyLabel>
        <Select
          size="sm"
          value={query.range}
          onChange={(e) => router.push(logHref(query, { range: e.target.value as RangeId, page: 1 }))}
        >
          {RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Filter by status" srOnlyLabel>
        <Select
          size="sm"
          value={query.status}
          onChange={(e) => router.push(logHref(query, { status: e.target.value as StatusFilter, page: 1 }))}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </FormField>
    </div>
  );
}

export function PageSize({ query }: { query: LogQuery }) {
  const router = useRouter();
  return (
    <label className="ts-per-page">
      Showing
      <Select
        size="sm"
        inline
        value={query.size}
        onChange={(e) => router.push(logHref(query, { size: Number(e.target.value), page: 1 }))}
      >
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
      items per page
    </label>
  );
}

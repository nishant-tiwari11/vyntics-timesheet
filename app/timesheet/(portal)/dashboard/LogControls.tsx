"use client";

import { useRouter } from "next/navigation";
import { FormField, Select } from "../../_components/Fields";
import {
  PAGE_SIZES,
  RANGES,
  logHref,
  type LogQuery,
  type RangeId,
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

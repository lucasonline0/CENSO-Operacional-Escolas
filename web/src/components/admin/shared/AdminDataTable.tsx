"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { C } from "./constants";
import type { EscolasBaseRow } from "./types";

const PAGE_SIZE_OPTIONS = [10, 50, 100, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export type DataTableColumn<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  render?: (row: T) => React.ReactNode;
};

type SortDir = "asc" | "desc";

type AdminDataTableProps<T extends EscolasBaseRow> = {
  title: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  keyField: keyof T & string;
  totalEscolas: number;
  totalFiltrado: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sortKey: string;
  sortDir: SortDir;
  loading: boolean;
  error?: string;
  onSort: (key: string) => void;
  onPage: (page: number) => void;
  onPageSize: (size: PageSizeOption) => void;
  onSearch: (q: string) => void;
};

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={11} aria-hidden="true" />;
  return dir === "asc"
    ? <ArrowUp size={11} aria-hidden="true" />
    : <ArrowDown size={11} aria-hidden="true" />;
}

function SortHeader<T>({
  col,
  activeKey,
  dir,
  onSort,
}: {
  col: DataTableColumn<T>;
  activeKey: string;
  dir: SortDir;
  onSort: (key: string) => void;
}) {
  const active = col.key === activeKey;
  const align =
    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left";

  if (!col.sortable) {
    return (
      <th
        scope="col"
        className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${align}`}
      >
        {col.label}
      </th>
    );
  }

  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${align}`}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-white/80"
        onClick={() => onSort(col.key)}
      >
        {col.label}
        <SortIcon active={active} dir={dir} />
      </button>
    </th>
  );
}

export function AdminDataTable<T extends EscolasBaseRow>({
  title,
  columns,
  rows,
  keyField,
  totalEscolas,
  totalFiltrado,
  page,
  pageSize,
  totalPages,
  sortKey,
  sortDir,
  loading,
  error,
  onSort,
  onPage,
  onPageSize,
  onSearch,
}: AdminDataTableProps<T>) {
  const [inputValue, setInputValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = useCallback(
    (value: string) => {
      setInputValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearch(value.trim());
      }, 400);
    },
    [onSearch],
  );

  const handleClear = useCallback(() => {
    setInputValue("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSearch("");
  }, [onSearch]);

  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    },
    [],
  );

  const firstItem = totalFiltrado === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalFiltrado);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex flex-col gap-3 px-5 py-3 border-b sm:flex-row sm:items-center sm:justify-between"
        style={{ background: C.primaryLight }}
      >
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex items-center">
            <Search
              size={14}
              className="absolute left-2.5 text-slate-400 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="Buscar escola ou INEP…"
              className="h-8 rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
              style={{ minWidth: 200 }}
            />
            {inputValue && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2 text-slate-400 hover:text-slate-600"
                aria-label="Limpar busca"
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Page size */}
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value) as PageSizeOption)}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s} por página
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-5 py-3 bg-rose-50 border-b border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="relative overflow-x-auto">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <Loader2 size={28} className="animate-spin text-slate-400" aria-hidden="true" />
          </div>
        )}

        <table className="w-full text-xs text-slate-700">
          <thead>
            <tr style={{ background: C.primary, color: "white" }}>
              {columns.map((col) => (
                <SortHeader
                  key={col.key}
                  col={col}
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-sm text-slate-400"
                >
                  Nenhuma escola encontrada.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const key = String(row[keyField as keyof T] ?? idx);
                return (
                  <tr
                    key={key}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                    }`}
                  >
                    {columns.map((col) => {
                      const align =
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                            ? "text-center"
                            : "text-left";
                      return (
                        <td key={col.key} className={`px-3 py-2.5 ${align}`}>
                          {col.render
                            ? col.render(row)
                            : (row[col.key as keyof T] as string | number | boolean | null) != null &&
                                (row[col.key as keyof T] as string) !== ""
                              ? String(row[col.key as keyof T])
                              : <span className="text-slate-400">—</span>
                          }
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer / Pagination */}
      <div className="flex flex-col gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[11px] text-slate-500">
          {totalFiltrado === 0
            ? "Nenhuma escola"
            : `${firstItem}–${lastItem} de ${totalFiltrado.toLocaleString("pt-BR")} escola${totalFiltrado !== 1 ? "s" : ""}`}
          {totalFiltrado !== totalEscolas && totalEscolas > 0 && (
            <> (de {totalEscolas.toLocaleString("pt-BR")} total)</>
          )}
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => onPage(page - 1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Página anterior"
          >
            <ArrowLeft size={13} aria-hidden="true" />
          </button>

          <span className="text-[11px] font-medium text-slate-600 tabular-nums">
            {page}/{totalPages || 1}
          </span>

          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => onPage(page + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Próxima página"
          >
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

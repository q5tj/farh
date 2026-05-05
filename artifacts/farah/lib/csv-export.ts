/**
 * Tiny CSV export helper. On web triggers a browser download via Blob.
 * On native shows an alert (admin tooling is web-first).
 *
 * Usage:
 *   downloadCsv("users.csv", users, [
 *     { key: "fullName", header: "الاسم" },
 *     { key: "email", header: "البريد" },
 *     ...
 *   ]);
 */

import { Alert, Platform } from "react-native";

export interface CsvColumn<T> {
  key: keyof T | string;
  header: string;
  /** Optional formatter; receives the raw value, returns a string. */
  format?: (value: unknown, row: T) => string;
}

function escapeCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv<T extends object>(
  rows: T[],
  columns: CsvColumn<T>[],
): string {
  const headerLine = columns.map((c) => escapeCell(c.header)).join(",");
  const bodyLines = rows.map((row) =>
    columns
      .map((c) => {
        const raw = (row as Record<string, unknown>)[c.key as string];
        const formatted = c.format ? c.format(raw, row) : raw;
        return escapeCell(formatted);
      })
      .join(","),
  );
  return [headerLine, ...bodyLines].join("\n");
}

export function downloadCsv<T extends object>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  if (rows.length === 0) {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.alert("لا توجد بيانات للتصدير");
    } else {
      Alert.alert("CSV", "لا توجد بيانات للتصدير");
    }
    return;
  }
  const csv = buildCsv(rows, columns);

  if (Platform.OS !== "web") {
    Alert.alert(
      "تنزيل CSV",
      "هذه الميزة متاحة في النسخة الويب فقط. افتح لوحة الإدارة من المتصفح للتصدير.",
    );
    return;
  }

  // Excel-friendly UTF-8 BOM so Arabic renders correctly when the file
  // is double-clicked into Excel on Windows.
  const BOM = "﻿";
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { storeGet } from "@/lib/tauri-store";
import type { CalendarListItem } from "@/lib/google-calendar";

/** 설정에서 지정한 기본 캘린더 ID (tauri-store 키) */
export const DEFAULT_CALENDAR_KEY = "google.defaultCalendarId";

/**
 * 기본 캘린더 ID 해석(순수): 저장된 기본이 현재 목록에 있으면 그 ID, 없으면 fallback.
 * (저장값이 비었거나 삭제된 캘린더를 가리키면 fallback)
 */
export function resolveDefaultCalendarId(
  calendars: Pick<CalendarListItem, "id">[],
  stored: string | null | undefined,
  fallbackId: string
): string {
  return stored && calendars.some((c) => c.id === stored) ? stored : fallbackId;
}

/**
 * 기본 캘린더 ID를 해석한다.
 * - 설정에 저장된 기본 캘린더가 현재 캘린더 목록에 있으면 그 ID
 * - 없으면 fallback(보통 Google primary 캘린더)
 *
 * reload(): tauri-store에서 다시 읽는다(설정 변경/플로팅창 재노출 시).
 */
export function useDefaultCalendarId(
  calendars: CalendarListItem[],
  fallbackId: string
): readonly [string, () => void] {
  const [stored, setStored] = useState<string | null>(null);

  const reload = useCallback(() => {
    void storeGet<string>(DEFAULT_CALENDAR_KEY).then((v) => setStored(v ?? null));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const id = useMemo(
    () => resolveDefaultCalendarId(calendars, stored, fallbackId),
    [stored, calendars, fallbackId]
  );

  return [id, reload] as const;
}

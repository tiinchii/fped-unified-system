const dateTime = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
const longDate = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});

/** The server stores times in UTC; they are always shown in Manila time. */
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '';
}

export function todayLong(): string {
  return longDate.format(new Date());
}

export function manilaHour(): number {
  return Number(new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false }).format(new Date()));
}

export const ROLE_LABEL = { ADMIN: 'Admin', ENCODER: 'Encoder', VIEWER: 'Viewer' } as const;
export const ROLES = ['ADMIN', 'ENCODER', 'VIEWER'] as const;

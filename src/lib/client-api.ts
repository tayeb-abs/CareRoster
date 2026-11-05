export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed (${response.status}).`);
  }
  return payload;
}

export function monthLabel(year: number, month: number, language = "en") {
  return new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function shortDate(value: string, language = "en") {
  return new Intl.DateTimeFormat(language, { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00.000Z`));
}

export function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

export type Nurse = {
  id: string;
  name: string;
  email: string | null;
  title: string;
  level: "SENIOR" | "REGULAR";
  color: string;
  isActive: boolean;
  deletedAt?: string | null;
};

export type ClinicProfile = {
  id: string;
  clinicNameEn: string;
  clinicNameAr: string;
  logoDataUrl: string | null;
  address: string | null;
  phoneNumber: string | null;
  departmentName: string | null;
  headNurseName: string | null;
};

export type Assignment = {
  id?: string;
  nurseId: string;
  date: string;
  type: "WORK" | "OFF" | "SICK" | "EMERGENCY";
  isManual: boolean;
  exceptionApproved?: boolean;
  overrideReason?: string | null;
  note?: string | null;
  nurse?: Pick<Nurse, "id" | "name" | "color" | "isActive" | "level">;
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "HEAD_NURSE";
};

import { translateText, type AppLanguage } from "@/lib/i18n";

export type RosterAssignment = {
  nurseId?: string;
  date: string;
  nurseName: string;
  nurseColor: string;
  nurseLevel: "SENIOR" | "REGULAR";
  type: "WORK" | "OFF" | "SICK" | "EMERGENCY";
  exceptionApproved?: boolean;
  isManual?: boolean;
};

export type ClinicBrand = {
  clinicNameEn: string;
  clinicNameAr: string;
  logoDataUrl?: string | null;
  address?: string | null;
  phoneNumber?: string | null;
  departmentName?: string | null;
  headNurseName?: string | null;
};

export type RosterDay = { date: string; label: string; isFriday: boolean };
export type RosterNurse = {
  name: string;
  level: "SENIOR" | "REGULAR";
  color: string;
  shifts: Map<string, { label: string; type: RosterAssignment["type"]; isManual: boolean; exceptionApproved: boolean }>;
};
export type WeeklyRoster = { days: RosterDay[]; nurses: RosterNurse[] };

export const defaultClinicBrand: ClinicBrand = {
  clinicNameEn: "Evercare Medical Center",
  clinicNameAr: "مركز إيفركير الطبي",
};

export function clinicName(clinic: ClinicBrand, language: AppLanguage) {
  return language === "ar" ? clinic.clinicNameAr : clinic.clinicNameEn;
}

export function safeBrandColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1).toUpperCase() : "176B9A";
}

function dayRange(startDate: string, count = 7) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function shiftLabel(assignment: RosterAssignment, language: AppLanguage) {
  const label = assignment.type === "WORK"
    ? translateText("Working · 10 hours", language)
    : translateText(assignment.type === "OFF" ? "Day off" : assignment.type === "SICK" ? "Sick leave" : "Emergency leave", language);
  return `${label}${assignment.exceptionApproved ? ` · ${translateText("Exception Approved", language)}` : ""}`;
}

export function buildWeeklyRoster(
  assignments: RosterAssignment[],
  startDate: string,
  language: AppLanguage,
): WeeklyRoster {
  const dates = dayRange(startDate);
  const days = dates.map((date) => ({
    date,
    label: `${new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`))} ${new Intl.DateTimeFormat(language, { month: "numeric", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`))}`,
    isFriday: new Date(`${date}T00:00:00.000Z`).getUTCDay() === 5,
  }));
  const byNurse = new Map<string, RosterNurse>();
  for (const assignment of assignments) {
    const key = assignment.nurseId ?? assignment.nurseName;
    let nurse = byNurse.get(key);
    if (!nurse) {
      nurse = {
        name: assignment.nurseName,
        level: assignment.nurseLevel,
        color: assignment.nurseColor,
        shifts: new Map(),
      };
      byNurse.set(key, nurse);
    }
    nurse.shifts.set(assignment.date, {
      label: shiftLabel(assignment, language),
      type: assignment.type,
      isManual: assignment.isManual ?? false,
      exceptionApproved: assignment.exceptionApproved ?? false,
    });
  }
  return {
    days,
    nurses: [...byNurse.values()].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function generatedDate(language: AppLanguage, value = new Date()) {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

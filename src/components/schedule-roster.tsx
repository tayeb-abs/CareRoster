"use client";

import type { DragEvent } from "react";
import type { Assignment, Nurse } from "@/lib/client-api";
import type { AppLanguage } from "@/lib/i18n";
import { translateText } from "@/lib/i18n";
import { formatShiftTime } from "@/lib/shifts";

type SeniorFridayWarning = {
  id: string;
  date: string;
  message: string;
};

export function ScheduleRoster({
  dates,
  nurses,
  assignments,
  language,
  today,
  warnings,
  shiftTypeFilter = "ALL",
  exceptionsOnly = false,
  onEdit,
  onDrop,
}: {
  dates: string[];
  nurses: Nurse[];
  assignments: Assignment[];
  language: AppLanguage;
  today: string;
  warnings: SeniorFridayWarning[];
  shiftTypeFilter?: Assignment["type"] | "ALL";
  exceptionsOnly?: boolean;
  onEdit: (assignment: Assignment | undefined, nurse: Nurse, date: string) => void;
  onDrop: (event: DragEvent<HTMLTableCellElement>, date: string, nurse: Nurse) => void;
}) {
  const formatDay = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language, { ...options, timeZone: "UTC" })
      .format(new Date(`${date}T00:00:00.000Z`));
  const assignmentsByKey = new Map(
    assignments.map((assignment) => [`${assignment.nurseId}|${assignment.date}`, assignment]),
  );
  const warningsByDate = new Map(warnings.map((warning) => [warning.date, warning]));
  const dateInfo = dates.map((date) => {
    const dateObject = new Date(`${date}T00:00:00.000Z`);
    return {
      date,
      isFriday: dateObject.getUTCDay() === 5,
      weekday: formatDay(date, { weekday: "short" }),
      day: formatDay(date, { day: "numeric" }),
      longDate: formatDay(date, { dateStyle: "long" }),
    };
  });

  const workCounts = new Map<string, number>();
  const seniorWorkCounts = new Map<string, number>();
  const nurseTotals = new Map<string, { work: number; off: number; hours: number }>();
  for (const assignment of assignments) {
    const totals = nurseTotals.get(assignment.nurseId) ?? { work: 0, off: 0, hours: 0 };
    if (assignment.type === "WORK") totals.work += 1;
    if (assignment.type === "OFF") totals.off += 1;
    totals.hours += (assignment.shiftAssignments ?? []).reduce((sum, shift) => sum + Number(shift.totalHours), 0);
    nurseTotals.set(assignment.nurseId, totals);
    if (assignment.type !== "WORK") continue;
    workCounts.set(assignment.date, (workCounts.get(assignment.date) ?? 0) + 1);
    if (assignment.nurse?.level === "SENIOR") {
      seniorWorkCounts.set(assignment.date, (seniorWorkCounts.get(assignment.date) ?? 0) + 1);
    }
  }

  return (
    <div className="roster-scroll" role="region" aria-label={translateText("Schedule roster", language)} tabIndex={0}>
      <table className="schedule-roster">
        <thead>
          <tr>
            <th className="roster-nurse-heading" scope="col">{translateText("Nurse", language)}</th>
            {dateInfo.map(({ date, isFriday, weekday, day }) => {
              const workCount = workCounts.get(date) ?? 0;
              const seniorCount = seniorWorkCounts.get(date) ?? 0;
              const warning = warningsByDate.get(date);
              const coverageIssue = isFriday && workCount !== 2;
              const seniorIssue = isFriday && seniorCount > 1;
              const coverageTitle = workCount < 2
                ? `${translateText("Understaffed", language)}: ${workCount}/2`
                : workCount > 2
                  ? `${translateText("Overstaffed", language)}: ${workCount}/2`
                  : "";
              const seniorTitle = seniorIssue ? translateText("Senior Friday conflict", language) : "";
              return (
                <th
                  className={`roster-date-heading${isFriday ? " roster-friday" : ""}${date === today ? " roster-today" : ""}`}
                  key={date}
                  scope="col"
                  title={[warning?.message, coverageTitle, seniorTitle].filter(Boolean).join(" · ") || undefined}
                >
                  <span className="roster-weekday">{weekday}</span>
                  <strong>{day}</strong>
                  {isFriday && <span className="roster-friday-badge">{translateText("Friday", language)}</span>}
                  {isFriday && (
                    <span className={`roster-coverage${coverageIssue || seniorIssue ? " roster-coverage-issue" : ""}`} aria-label={coverageTitle || seniorTitle || `${workCount}/2`}>
                      {workCount}/2
                    </span>
                  )}
                  {(warning || seniorIssue) && <span className="roster-warning-indicator" title={warning?.message ?? seniorTitle}>!</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {nurses.map((nurse) => (
            <tr key={nurse.id}>
              <th className="roster-nurse-cell" scope="row">
                <span className="roster-nurse-name">
                  <i style={{ backgroundColor: nurse.color }} />
                  <span>{nurse.name}</span>
                </span>
                <span className="roster-workload">
                  <span>{translateText("WORK", language)} {nurseTotals.get(nurse.id)?.work ?? 0}</span>
                  <span>{new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(nurseTotals.get(nurse.id)?.hours ?? 0)} {translateText("hours", language)}</span>
                  <span>{translateText("OFF", language)} {nurseTotals.get(nurse.id)?.off ?? 0}</span>
                </span>
                {nurse.level === "SENIOR" ? (
                  <span className="roster-level roster-level-senior">{translateText("⭐ Senior Nurse", language)}</span>
                ) : (
                  <span className="roster-level">{translateText("Regular Nurse", language)}</span>
                )}
              </th>
              {dateInfo.map(({ date, isFriday, longDate }) => {
                const assignment = assignmentsByKey.get(`${nurse.id}|${date}`);
                const isFiltered = Boolean(assignment && (
                  (shiftTypeFilter !== "ALL" && assignment.type !== shiftTypeFilter) ||
                  (exceptionsOnly && assignment.type !== "SICK" && assignment.type !== "EMERGENCY" && !assignment.isManual)
                ));
                if (!assignment) {
                  return (
                    <td
                      className={isFriday ? "roster-friday-cell" : ""}
                      key={date}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => onDrop(event, date, nurse)}
                    >
                      <button
                        type="button"
                        className="roster-empty-cell"
                        aria-label={`${translateText("Add shift", language)}: ${nurse.name}, ${longDate}`}
                        onClick={() => onEdit(undefined, nurse, date)}
                      >
                        +
                      </button>
                    </td>
                  );
                }
                if (isFiltered) {
                  return <td className={`${isFriday ? "roster-friday-cell " : ""}roster-filtered-cell`} key={date} aria-label={translateText("Hidden by filters", language)} />;
                }
                const shiftLabel = assignment.type === "WORK"
                  ? assignment.shiftAssignments?.length
                    ? assignment.shiftAssignments.map((shift) =>
                        `${shift.shiftName}\n${formatShiftTime(shift.startTime, language)} → ${formatShiftTime(shift.endTime, language)} · ${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(Number(shift.totalHours))} ${translateText("hours", language)}`,
                      ).join("\n")
                    : translateText("Shift not assigned", language)
                  : translateText(assignment.type === "OFF" ? "OFF" : assignment.type === "SICK" ? "SICK" : "EMERGENCY", language);
                const shiftClass = `roster-shift-${assignment.type.toLowerCase()}`;
                const metadata = [
                  assignment.exceptionApproved ? translateText("Exception Approved", language) : "",
                ].filter(Boolean).join(" · ");
                return (
                  <td
                    className={isFriday ? "roster-friday-cell" : ""}
                    key={date}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => onDrop(event, date, nurse)}
                  >
                    <button
                      type="button"
                      draggable
                      className={`roster-shift-cell ${shiftClass}${assignment.exceptionApproved ? " roster-exception-approved" : ""}`}
                      title={`${nurse.name} · ${shiftLabel.replace("\n", " ")}${metadata ? ` · ${metadata}` : ""}`}
                      style={assignment.type === "WORK" && assignment.shiftAssignments?.[0]?.color ? { borderInlineStartColor: assignment.shiftAssignments[0].color, borderInlineStartWidth: 3 } : undefined}
                      onClick={() => onEdit(assignment, nurse, date)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/json", JSON.stringify(assignment));
                        event.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <span className="roster-shift-label">{nurse.level === "SENIOR" && assignment.type === "WORK" ? "⭐ " : ""}{shiftLabel}</span>
                      {metadata && <small>{metadata}</small>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
          {nurses.length === 0 && (
            <tr><td className="roster-no-nurses" colSpan={dates.length + 1}>{translateText("Add nurses to start building your roster.", language)}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

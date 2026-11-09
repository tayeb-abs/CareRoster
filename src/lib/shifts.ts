export type ShiftDefinition = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string | null;
};

export function shiftDurationHours(startTime: string, endTime: string) {
  const toMinutes = (value: string) => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!match) throw new Error("Shift times must use 24-hour HH:mm format.");
    return Number(match[1]) * 60 + Number(match[2]);
  };
  let minutes = toMinutes(endTime) - toMinutes(startTime);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatShiftTime(value: string, language: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return new Intl.DateTimeFormat(language, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2020, 0, 1, hours, minutes)));
}

export function shiftSnapshot(shift: ShiftDefinition) {
  return {
    shiftTemplateId: shift.id,
    shiftName: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    color: shift.color,
    totalHours: shiftDurationHours(shift.startTime, shift.endTime),
  };
}

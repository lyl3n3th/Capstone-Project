export const IRREGULAR_SEMESTER_UNIT_LIMIT = 20;

type ScheduleUnitItem = { units?: number | null };

export const getScheduleTotalUnits = (selections: ScheduleUnitItem[]) =>
  selections.reduce((sum, selection) => sum + (selection.units ?? 0), 0);

export const getIrregularScheduleUnitError = (
  selections: ScheduleUnitItem[],
): string | null => {
  if (selections.some(({ units }) =>
    typeof units !== "number" || !Number.isFinite(units) || units < 0,
  )) {
    return "Some selected subjects have missing or invalid units. Ask the admin or registrar to update their units before requesting a schedule.";
  }
  const total = getScheduleTotalUnits(selections);
  return total > IRREGULAR_SEMESTER_UNIT_LIMIT
    ? `Irregular students can request a maximum of ${IRREGULAR_SEMESTER_UNIT_LIMIT} units per semester. Your selected load is ${total} units, including leftover subjects. Remove subjects before continuing.`
    : null;
};

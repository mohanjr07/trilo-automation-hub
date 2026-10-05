// Site visits are planned for the first half or second half of a day instead
// of an exact time. Stored in planned_at as a fixed time on that date
// (first half = 09:30, second half = 14:00, local time).
export type VisitHalf = "first" | "second";

export const HALF_TIME: Record<VisitHalf, string> = { first: "09:30", second: "14:00" };

export const halfOf = (iso: string): VisitHalf => (new Date(iso).getHours() < 13 ? "first" : "second");

export const halfLabel = (iso: string) => (halfOf(iso) === "first" ? "First half" : "Second half");

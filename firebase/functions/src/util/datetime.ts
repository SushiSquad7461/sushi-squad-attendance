export const minutesFromTime = (time: string): number => {
    const [hours, minutes] = time.split(":").map((s) => parseInt(s));
    return hours * 60 + minutes;
};

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Get the current date in the Pacific timezone as a string. Use
 * this for display purposes.
 * @param date
 * @returns Date in the format MM/DD/YY (2-digit) or MM/DD/YYYY (default/numeric)
 */
export function pacificLocaleDateStr(date: Date) {
    return date.toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        timeZone: "America/Los_Angeles",
    });
}

export function dateFromPacificDateStr(dateStr: string) {
    const dateTimeStr = `${dateStr}T00:00:00-08:00`;
    return new Date(dateTimeStr);
}

/**
 *
 * @param date
 * @returns
 */
export function pacificWeekdayStr(date: Date) {
    return date.toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "America/Los_Angeles",
    });
}

/**
 * Returns ISO 8601 pacific date string in the YYYY-MM-DD format Notion expects.
 * @param date
 * @returns
 */
export function pacificDateStr(date: Date) {
    const [month, day, year] = date
        .toLocaleDateString("en-US", {
            month: "numeric",
            day: "numeric",
            year: "numeric",
            timeZone: "America/Los_Angeles",
        })
        .split("/");
    return `${year}-${new String(month).padStart(2, "0")}-${new String(
        day
    ).padStart(2, "0")}`;
    // return date.toISOString().split("T")[0];
}

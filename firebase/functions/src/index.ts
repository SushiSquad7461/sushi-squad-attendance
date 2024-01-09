import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import logAttendanceHandler from "./functions/log-attendance";
import exportAttendanceHandler from "./functions/export-attendance";

export const logAttendance = onCall(
    { cors: ["https://localhost:5173", "https://sushisquad.org"] },
    logAttendanceHandler
);

// AppEngine schedule syntax https://cloud.google.com/appengine/docs/flexible/scheduling-jobs-with-cron-yaml
export const exportAttendance = onSchedule(
    { schedule: "every sunday 5:00", timeZone: "America/Los_Angeles" },
    exportAttendanceHandler
);

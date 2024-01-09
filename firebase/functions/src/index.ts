/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import emailRegex from "./util/email-regex";
import {
    pacificDateStr,
    pacificWeekdayStr,
    pacificLocaleDateStr,
    minutesFromTime,
    ONE_DAY_MS,
} from "./util/datetime";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import {
    basicFilterView,
    gradientRule,
    updateDimension,
} from "./util/google-sheets";
import Meetings, { getMeetingByDate } from "./models/meeting";
import Attendances from "./models/attendance";
import Users from "./models/user";

/** Days of the week and times that are valid meetings */
const validMeetingTimes = [
    {
        day: "Tuesday",
        start: minutesFromTime("16:00"),
        end: minutesFromTime("19:00"),
    },
    {
        day: "Wednesday",
        start: minutesFromTime("16:00"),
        end: minutesFromTime("19:00"),
    },
    {
        day: "Thursday",
        start: minutesFromTime("16:00"),
        end: minutesFromTime("19:00"),
    },
    {
        day: "Saturday",
        start: minutesFromTime("10:00"),
        end: minutesFromTime("16:00"),
    },
];

/** can submit attendance log 30 minutes before or after the meeting */
const VALID_MEETING_TIME_EPSILON = 30; // minutes

/** 75% attendance target */
const ATTENDANCE_TARGET = 0.75;
const ATTENDANCE_MINIMUM = 0.5;

export const logAttendance = onCall(
    { cors: ["https://localhost:5173", "https://sushisquad.org"] },
    async (request) => {
        const { email, description } = request.data;
        logger.debug(
            `Attendance log requested for email ${email}: ${description}`
        );
        // check if the email is valid
        if (!email || typeof email !== "string") {
            throw new HttpsError("invalid-argument", "No email");
        }
        const trimmedEmail = email.trim();
        if (emailRegex.test(trimmedEmail) === false) {
            throw new HttpsError("invalid-argument", "Invalid email");
        }

        const user = (await Users.query({ email: trimmedEmail }))[0];
        if (!user) {
            throw new HttpsError(
                "invalid-argument",
                "Found no user with that email"
            );
        }

        const parsedDescription: string = (description as string)?.trim() ?? "";

        // check if the time is within the valid meeting time epsilon
        const now = new Date();
        const day = now.toLocaleDateString("en-US", {
            weekday: "long",
            timeZone: "America/Los_Angeles",
        });
        const time = now.toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Los_Angeles",
        });
        const minutes = minutesFromTime(time);

        const validMeetingDay = validMeetingTimes.find((t) => t.day === day);

        // check if meeting doesn't exist
        let meeting = await getMeetingByDate(now);

        if (!meeting) {
            // if no meeting exists and it's not a prescheduled
            // meeting time, throw an error
            if (!validMeetingDay) {
                throw new HttpsError(
                    "deadline-exceeded",
                    "No meeting to attend at this time"
                );
            }

            // if it doesn't exist, create it
            meeting = await Meetings.create({ date: now });
        } else {
            // if it does exist, check if it's a prescheduled meeting time
            if (validMeetingDay) {
                // if it is, check that we are within the
                // valid meeting time epsilon
                const validMeetingTime =
                    validMeetingDay.start - VALID_MEETING_TIME_EPSILON <=
                        minutes &&
                    minutes <= validMeetingDay.end + VALID_MEETING_TIME_EPSILON;

                if (!validMeetingTime) {
                    throw new HttpsError(
                        "deadline-exceeded",
                        "No meeting to attend at this time"
                    );
                }
            }

            // if it does exist, check if user already has an entry
            const attendance = await Attendances.query({
                meetingId: meeting.id,
                userId: user.id,
            });

            if (attendance.length) {
                throw new HttpsError(
                    "already-exists",
                    "Already logged attendance"
                );
            }
        }

        // log user's attendance
        try {
            await Attendances.create({
                user,
                meeting,
                description: parsedDescription,
            });
        } catch (err) {
            logger.error(err);
            throw new HttpsError("internal", "Error logging attendance", err);
        }

        logger.debug(`Attendance logged succesfully for ${email}`);
        return { message: "Attendance logged successfully" };
    }
);

// Initialize auth - see https://theoephraim.github.io/node-google-spreadsheet/#/guides/authentication
const serviceAccountAuth = new JWT({
    // env var values here are copied from service
    // account credentials generated by google
    // see "Authentication" section in docs for more info
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY,
    scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
    ],
});

const doc = new GoogleSpreadsheet(
    process.env.GOOGLE_ATTENDANCE_SHEET_ID,
    serviceAccountAuth
);

// AppEngine schedule syntax https://cloud.google.com/appengine/docs/flexible/scheduling-jobs-with-cron-yaml
export const exportAttendance = onSchedule(
    "every sunday 5:00 America/Los_Angeles",
    async () => {
        try {
            logger.debug("Exporting attendance");
            const now = new Date();
            const lastWeek = new Date(now.getTime() - 7 * ONE_DAY_MS);
            const yesterday = new Date(now.valueOf() - ONE_DAY_MS);
            const newSheet = await doc.addSheet({
                title: `${pacificLocaleDateStr(
                    lastWeek
                )} - ${pacificLocaleDateStr(yesterday)}`,
            });
            const aggregateSheet =
                doc.sheetsById[
                    parseInt(
                        process.env.GOOGLE_ATTENDANCE_AGGREGATE_WORKSHEET_ID
                    )
                ];

            logger.info("New sheet created", newSheet.sheetId);

            // get all meetings from last week (in case a meeting is cancelled)
            const meetingsResponse = await Meetings.query({
                onOrAfter: lastWeek,
                onOrBefore: yesterday,
            });
            const meetings: { id: string; day: Date; meetingLength: number }[] =
                [];
            let maxHours = 0;
            meetingsResponse.forEach((meeting) => {
                const meetingInfo = validMeetingTimes.find(
                    (t) => t.day === pacificWeekdayStr(meeting.date)
                ) ?? { start: 0, end: 180 };
                if (!meetingInfo) return;

                const meetingLength =
                    (meetingInfo.end - meetingInfo.start) / 60; // hours

                meetings.push({
                    id: meeting.id,
                    meetingLength,
                    day: meeting.date,
                });
                maxHours += meetingLength;
            });

            // get all attendance logs from last week
            const attendance = await Attendances.query({
                onOrAfter: lastWeek,
                onOrBefore: yesterday,
            });

            const weekRows: Record<string, string | number>[] = [];
            const aggregateRows: Record<string, string | number>[] = [];
            const people = new Map<
                string,
                { name: string; meetings: string[] }
            >(); // email -> name
            for (const entry of attendance) {
                const name = entry.user.name;
                const email = entry.user.email;
                if (!name || !email) continue;

                // find the meeting this entry is for
                const meeting = meetings.find((m) => m.id === entry.meetingId);
                if (!meeting) continue;

                const day = pacificDateStr(meeting.day);

                if (people.get(email)?.meetings.includes(meeting.id)) continue; // don't add duplicate entries

                weekRows.push({
                    Email: email,
                    Day: day,
                    Hours: meeting.meetingLength,
                });
                aggregateRows.push({
                    Name: name,
                    Email: email,
                    Day: day,
                    Hours: meeting.meetingLength,
                });
                if (people.has(email)) {
                    people.get(email)?.meetings.push(meeting.id);
                } else {
                    people.set(email, { name, meetings: [meeting.id] });
                }
            }

            // don't include statistics in aggregate sheet, those will be setup manually
            await aggregateSheet.addRows(aggregateRows, { insert: true });

            // create user statistics
            let i = 0;
            for (const [email, { name }] of people) {
                weekRows[i].Name = name;
                weekRows[i]["Notion Email"] = email;
                // rows[i].Attendance = hours / maxHours;
                i++;
            }

            // add rows to sheet
            await newSheet.setHeaderRow([
                "Email",
                "Day",
                "Hours",
                "",
                "Name",
                "Notion Email",
                "Attendance",
            ]);
            await newSheet.addRows(weekRows);

            await newSheet.loadCells(`G1:G${i + 2}`);
            for (let j = 0; j < i; j++) {
                const cell = newSheet.getCellByA1(`G${j + 2}`);
                cell.numberFormat = { type: "PERCENT", pattern: "0.0%" };
                // A2:A is the range of emails, F2 is the email to match, C2:C is the range of attendance hours, J3 is the max hours
                cell.formula = `=SUMIF(A2:A, F${j + 2}, C2:C) / J3`;
            }

            await newSheet.loadCells("I1:J4");
            const i1 = newSheet.getCellByA1("I1");
            i1.value = "Attendance Target";
            const j1 = newSheet.getCellByA1("J1");
            j1.value = ATTENDANCE_TARGET;
            j1.numberFormat = { type: "PERCENT", pattern: "0%" };

            const i2 = newSheet.getCellByA1("I2");
            i2.value = "Minimum Attendance";
            const j2 = newSheet.getCellByA1("J2");
            j2.value = ATTENDANCE_MINIMUM;
            j2.numberFormat = { type: "PERCENT", pattern: "0%" };

            const i3 = newSheet.getCellByA1("I3");
            i3.value = "Total Meeting Hours";
            const j3 = newSheet.getCellByA1("J3");
            j3.value = maxHours;

            const i4 = newSheet.getCellByA1("I4");
            i4.value = "Total Man Hours";
            const j4 = newSheet.getCellByA1("J4");
            j4.formula = "=SUM(C2:C)";

            await newSheet.loadCells(`B2:B${weekRows.length + 2}`);
            for (let i = 0; i < weekRows.length; i++) {
                const cell = newSheet.getCellByA1(`B${i + 2}`);
                cell.numberFormat = { type: "DATE", pattern: "M/D/YYYY" };
            }
            await newSheet.saveUpdatedCells();

            await doc.sheetsApi.post(
                `https://sheets.googleapis.com/v4/spreadsheets/${doc.spreadsheetId}:batchUpdate`,
                {
                    requests: [
                        gradientRule(
                            newSheet.sheetId,
                            {
                                startRowIndex: 1,
                                endRowIndex: i + 1,
                                startColumnIndex: 6,
                                endColumnIndex: 7,
                            },
                            {
                                minpoint: {
                                    color: {
                                        red: 0.78,
                                        green: 0,
                                        blue: 0.22,
                                    },
                                    type: "NUMBER",
                                    value: "0",
                                },
                                midpoint: {
                                    color: {
                                        red: 1,
                                        green: 0.76,
                                    },
                                    type: "NUMBER",
                                    value: `${ATTENDANCE_MINIMUM}`,
                                },
                                maxpoint: {
                                    color: {
                                        red: 0.18,
                                        green: 0.8,
                                        blue: 0.44,
                                    },
                                    type: "NUMBER",
                                    value: `${ATTENDANCE_TARGET}`,
                                },
                            }
                        ),
                        updateDimension(newSheet.sheetId, "COLUMNS", 200, 0, 1),
                        updateDimension(newSheet.sheetId, "COLUMNS", 200, 4, 6),
                        updateDimension(newSheet.sheetId, "COLUMNS", 135, 8),
                        updateDimension(newSheet.sheetId, "COLUMNS", 50, 9),
                        basicFilterView(newSheet.sheetId, 0, 3, "Email"),
                    ],
                }
            );

            logger.debug("Attendance exported successfully");
        } catch (err) {
            logger.error(err);
        }
    }
);

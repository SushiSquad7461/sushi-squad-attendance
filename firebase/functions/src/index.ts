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
import emailRegex from "./email-regex";
import NotionClient, {
    dateFromPacificDateStr,
    pacificDateStr,
    pacificWeekdayStr,
    pacificLocaleDateStr,
    text,
} from "./notion-client";
import {
    BlockObjectRequest,
    PageObjectResponse,
    UserObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { gradientRule, updateDimension } from "./google-sheets";

const minutesFromTime = (time: string): number => {
    const [hours, minutes] = time.split(":").map((s) => parseInt(s));
    return hours * 60 + minutes;
};

/** 75% attendance target */
const ATTENDANCE_TARGET = 0.75;
const ATTENDANCE_MINIMUM = 0.5;

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

        const user = await NotionClient.findUser(trimmedEmail);
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

        const validMeetingTime = validMeetingTimes.find(
            (t) =>
                t.day === day &&
                t.start - VALID_MEETING_TIME_EPSILON <= minutes &&
                minutes <= t.end + VALID_MEETING_TIME_EPSILON
        );
        if (!validMeetingTime) {
            throw new HttpsError(
                "deadline-exceeded",
                "No meeting to attend at this time"
            );
        }

        // check if meeting doesn't exist
        let meeting = await NotionClient.queryDatabaseForDate(
            process.env.NOTION_MEETINGS_DBID,
            now
        );

        if (!meeting || meeting.object !== "page") {
            // if it doesn't exist, create it
            meeting = await NotionClient.createSimplePageInDatabase(
                process.env.NOTION_MEETINGS_DBID,
                "Name",
                `${pacificDateStr(now)}`,
                {
                    Date: {
                        type: "date",
                        date: {
                            start: pacificDateStr(now),
                            time_zone: "America/Los_Angeles",
                        },
                    },
                }
            );
        } else {
            // if it does exist, check if user already has an entry
            const attendance = await NotionClient.queryDatabase(
                process.env.NOTION_ATTENDANCE_DBID,
                {
                    property: "Meetings",
                    relation: {
                        contains: meeting.id,
                    },
                },
                {
                    property: "Person",
                    type: "people",
                    people: {
                        contains: user.id,
                    },
                }
            );

            if (attendance) {
                throw new HttpsError(
                    "already-exists",
                    "Already logged attendance"
                );
            }
        }

        // log user's attendance
        try {
            const children: BlockObjectRequest[] = [
                {
                    type: "paragraph",
                    paragraph: text(
                        "Attendance logged via https://sushisquad.org/sushi-squad-attendance"
                    ),
                },
            ];
            if (parsedDescription) {
                children.push({
                    type: "heading_2",
                    heading_2: text("Description"),
                });
                children.push({
                    type: "paragraph",
                    paragraph: text(parsedDescription),
                });
            }

            const page = await NotionClient.createSimplePageInDatabase(
                process.env.NOTION_ATTENDANCE_DBID,
                "Title",
                `${user.name} ${pacificDateStr(now)}`,
                {
                    Person: {
                        type: "people",
                        people: [
                            {
                                id: user.id,
                            },
                        ],
                    },
                    Meetings: {
                        type: "relation",
                        relation: [
                            {
                                id: meeting.id,
                            },
                        ],
                    },
                },
                children
            );
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
export const exportAttendance = onSchedule("every sunday 5:00", async () => {
    logger.debug("Exporting attendance");
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const newSheet = await doc.addSheet({
        title: `${pacificLocaleDateStr(lastWeek)} - ${pacificLocaleDateStr(
            now
        )}`,
    });
    const aggregateSheet =
        doc.sheetsById[
            parseInt(process.env.GOOGLE_ATTENDANCE_AGGREGATE_WORKSHEET_ID)
        ];

    logger.info("New sheet created", newSheet.sheetId);

    // get all meetings from last week (in case a meeting is cancelled)
    const meetingsResponse = await NotionClient.queryAllDatabase(
        process.env.NOTION_MEETINGS_DBID,
        {
            property: "Date",
            date: {
                on_or_after: pacificDateStr(lastWeek),
            },
        }
    );
    const meetings: { id: string; day: Date; meetingLength: number }[] = [];
    let maxHours = 0;
    meetingsResponse.forEach((meeting) => {
        if (meeting.object !== "page") return;
        if (!(meeting as PageObjectResponse).properties) return;
        const m = meeting as PageObjectResponse;

        if (!m.properties.Date || m.properties.Date.type !== "date") return;
        if (!m.properties.Date.date?.start) return;
        // will already be in pacific date str format
        const day = dateFromPacificDateStr(m.properties.Date.date.start);
        logger.info(`Found meeting on ${m.properties.Date.date.start}`);

        const meetingInfo = validMeetingTimes.find(
            (t) => t.day === pacificWeekdayStr(day)
        );
        if (!meetingInfo) return;

        const meetingLength = (meetingInfo.end - meetingInfo.start) / 60; // hours

        meetings.push({
            id: meeting.id,
            meetingLength,
            day,
        });
        maxHours += meetingLength;
    });

    // get all attendance logs from last week
    const attendance = await NotionClient.queryAllDatabase(
        process.env.NOTION_ATTENDANCE_DBID,
        {
            property: "Created time",
            date: {
                on_or_after: pacificDateStr(lastWeek), // need to add an additional condition if want to be able to use this for backfill
            },
        },
        {
            property: "Meetings",
            relation: {
                is_not_empty: true,
            },
        }
        // uncomment this to ignore attendance logs that are created manually
        // {
        //     property: "Created by",
        //     people: {
        //         contains: process.env.NOTION_BOT_USER_ID,
        //     },
        // }
    );

    const weekRows: Record<string, string | number>[] = [];
    const aggregateRows: Record<string, string | number>[] = [];
    const people = new Map<string, string>(); // email -> name
    for (const entry of attendance) {
        const page = entry as PageObjectResponse;
        const peopleProp = page.properties.Person;
        if (
            !peopleProp ||
            peopleProp.type !== "people" ||
            !peopleProp.people.length
        )
            continue;

        const person = peopleProp.people[0] as UserObjectResponse;
        const meetingsProp = page.properties.Meetings;
        if (
            person.type !== "person" ||
            meetingsProp.type !== "relation" ||
            !meetingsProp.relation.length
        )
            continue;

        const name = person.name;
        const email = person.person.email;
        if (!name || !email) continue;
        const meeting = meetings.find(
            (m) => m.id === meetingsProp.relation[0].id
        );
        if (!meeting) continue;

        const day = pacificDateStr(meeting.day);
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
        if (!people.has(email)) {
            people.set(email, name);
        }
    }

    // don't include statistics in aggregate sheet, those will be setup manually
    await aggregateSheet.addRows(aggregateRows, { insert: true });

    // create user statistics
    let i = 0;
    for (const [email, name] of people) {
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
                            value: "=J2",
                        },
                        maxpoint: {
                            color: {
                                red: 0.18,
                                green: 0.8,
                                blue: 0.44,
                            },
                            type: "NUMBER",
                            value: "=J1",
                        },
                    }
                ),
                updateDimension(newSheet.sheetId, "COLUMNS", 200, 0, 1),
                updateDimension(newSheet.sheetId, "COLUMNS", 200, 4, 6),
                updateDimension(newSheet.sheetId, "COLUMNS", 135, 8),
                updateDimension(newSheet.sheetId, "COLUMNS", 50, 9),
            ],
        }
    );

    logger.debug("Attendance exported successfully");
});

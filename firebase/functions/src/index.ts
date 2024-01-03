/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import emailRegex from "./email-regex";
import NotionClient, {pacificDateStr, text} from "./notion-client";
import {
    BlockObjectRequest,
} from "@notionhq/client/build/src/api-endpoints";

const minutesFromTime = (time: string): number => {
    const [hours, minutes] = time.split(":").map((s) => parseInt(s));
    return hours * 60 + minutes;
};

/** Days of the week and times that are valid meetings */
const validMeetingTimes = [
    {
        day: "Monday",
        start: minutesFromTime("16:00"),
        end: minutesFromTime("20:00"),
    },
    {
        day: "Tuesday",
        start: minutesFromTime("16:00"),
        end: minutesFromTime("20:00"),
    },
    {
        day: "Thursday",
        start: minutesFromTime("16:00"),
        end: minutesFromTime("20:00"),
    },
    {
        day: "Saturday",
        start: minutesFromTime("10:00"),
        end: minutesFromTime("17:00"),
    },

    {
        day: "Tuesday",
        start: minutesFromTime("0:00"),
        end: minutesFromTime("24:00"),
    },
];

/** can submit attendance log 30 minutes before or after the meeting */
const validMeetingTimeEpsilon = 30; // minutes

export const logAttendance = onCall(
    {cors: ["https://localhost:5173", "https://sushisquad.org"]},
    async (request) => {
        const {email, description} = request.data;
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
                t.start - validMeetingTimeEpsilon <= minutes &&
                minutes <= t.end + validMeetingTimeEpsilon
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
                            start: now.toISOString().split("T")[0],
                        },
                    },
                }
            )
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
                    }
                },
                children
            )
            logger.debug("Attendance logged", page);
        } catch (err) {
            logger.error(err);
            throw new HttpsError("internal", "Error logging attendance", err);
        }

        logger.debug(`Attendance logged succesfully for ${email}`);
        return { message: "Attendance logged successfully" };
    }
);

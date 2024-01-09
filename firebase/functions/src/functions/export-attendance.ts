import * as logger from "firebase-functions/logger";
import {
    ONE_DAY_MS,
    pacificDateStr,
    pacificLocaleDateStr,
    pacificWeekdayStr,
    validMeetingTimes,
} from "../util/datetime";
import {
    basicFilterView,
    getSheet,
    googleSpreadsheet,
    gradientRule,
    updateDimension,
} from "../util/google-sheets";
import Meetings from "../models/meeting";
import Attendances from "../models/attendance";
import { HttpsError } from "firebase-functions/v2/https";

/** 75% attendance target */
const ATTENDANCE_TARGET = 0.75;
const ATTENDANCE_MINIMUM = 0.5;

const doc = googleSpreadsheet(process.env.GOOGLE_ATTENDANCE_SHEET_ID);

const attendanceSheetUpdateErrorCallback = (err: Error) => {
    logger.error(
        err,
        "It is recommended to delete the attendance sheet and re-run the export"
    );
    throw new HttpsError("internal", "Error updating attendance sheet");
};

const exportAttendanceHandler = async () => {
    logger.debug("Exporting attendance");
    await doc.loadInfo();
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * ONE_DAY_MS);
    const yesterday = new Date(now.getTime() - ONE_DAY_MS);

    if (
        doc.sheetsById[
            parseInt(process.env.GOOGLE_ATTENDANCE_AGGREGATE_WORKSHEET_ID)
        ] === undefined
    ) {
        logger.error("Aggregate worksheet not found");
        throw new HttpsError(
            "failed-precondition",
            "Attendance aggregate worksheet not found"
        );
    }

    const weekSheetPromise = getSheet(
        doc,
        `${pacificLocaleDateStr(lastWeek)} - ${pacificLocaleDateStr(yesterday)}`
    );
    const meetingsPromise = Meetings.query({
        onOrAfter: lastWeek,
        onOrBefore: yesterday,
    });
    const attendancePromise = Attendances.query({
        onOrAfter: lastWeek,
        onOrBefore: yesterday,
    });

    const [weekSheet, meetings, attendance] = await Promise.all([
        weekSheetPromise,
        meetingsPromise,
        attendancePromise,
    ]).catch((err) => {
        logger.error(err);
        throw new HttpsError("internal", "Error getting attendance data");
    });

    const meetingsWithLength: {
        id: string;
        day: Date;
        meetingLength: number;
    }[] = [];
    let maxHours = 0;
    meetings.forEach((meeting) => {
        const meetingInfo = validMeetingTimes.find(
            (t) => t.day === pacificWeekdayStr(meeting.date)
        ) ?? { start: 960, end: 1140 };

        const meetingLength = (meetingInfo.end - meetingInfo.start) / 60; // hours

        meetingsWithLength.push({
            id: meeting.id,
            meetingLength,
            day: meeting.date,
        });
        maxHours += meetingLength;
    });

    const weekRows: Record<string, string | number>[] = [];
    const aggregateRows: Record<string, string | number>[] = [];
    const people = new Map<string, { name: string; meetings: string[] }>(); // email -> name
    for (const entry of attendance) {
        const name = entry.user.name;
        const email = entry.user.email;
        if (!name || !email) continue;

        // find the meeting this entry is for
        const meeting = meetingsWithLength.find(
            (m) => m.id === entry.meetingId
        );
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
    doc.sheetsById[
        parseInt(process.env.GOOGLE_ATTENDANCE_AGGREGATE_WORKSHEET_ID)
    ].addRows(aggregateRows, { insert: true });

    // create user statistics
    let i = 0;
    for (const [email, { name }] of people) {
        weekRows[i].Name = name;
        weekRows[i]["Notion Email"] = email;
        // rows[i].Attendance = hours / maxHours;
        i++;
    }

    // add rows to sheet
    await weekSheet
        .setHeaderRow([
            "Email",
            "Day",
            "Hours",
            "",
            "Name",
            "Notion Email",
            "Attendance",
        ])
        .catch(attendanceSheetUpdateErrorCallback);
    await weekSheet.addRows(weekRows).catch(attendanceSheetUpdateErrorCallback);

    const statCellsPromise = weekSheet.loadCells(`G1:G${i + 2}`).then(() => {
        for (let j = 0; j < i; j++) {
            const cell = weekSheet.getCellByA1(`G${j + 2}`);
            cell.numberFormat = { type: "PERCENT", pattern: "0.0%" };
            // A2:A is the range of emails, F2 is the email to match, C2:C is the range of attendance hours, J3 is the max hours
            cell.formula = `=SUMIF(A2:A, F${j + 2}, C2:C) / J3`;
        }
    });

    const metadataCellsPromise = weekSheet.loadCells("I1:J4").then(() => {
        const i1 = weekSheet.getCellByA1("I1");
        i1.value = "Attendance Target";
        const j1 = weekSheet.getCellByA1("J1");
        j1.value = ATTENDANCE_TARGET;
        j1.numberFormat = { type: "PERCENT", pattern: "0%" };

        const i2 = weekSheet.getCellByA1("I2");
        i2.value = "Minimum Attendance";
        const j2 = weekSheet.getCellByA1("J2");
        j2.value = ATTENDANCE_MINIMUM;
        j2.numberFormat = { type: "PERCENT", pattern: "0%" };

        const i3 = weekSheet.getCellByA1("I3");
        i3.value = "Total Meeting Hours";
        const j3 = weekSheet.getCellByA1("J3");
        j3.value = maxHours;

        const i4 = weekSheet.getCellByA1("I4");
        i4.value = "Total Man Hours";
        const j4 = weekSheet.getCellByA1("J4");
        j4.formula = "=SUM(C2:C)";
    });

    const dateCellsPromise = weekSheet
        .loadCells(`B2:B${weekRows.length + 2}`)
        .then(() => {
            for (let i = 0; i < weekRows.length; i++) {
                const cell = weekSheet.getCellByA1(`B${i + 2}`);
                cell.numberFormat = { type: "DATE", pattern: "M/D/YYYY" };
            }
        });

    await Promise.all([
        statCellsPromise,
        metadataCellsPromise,
        dateCellsPromise,
    ]).catch((err) => {
        logger.error(err);
        throw new HttpsError("internal", "Error loading attendance sheet data");
    });
    weekSheet.saveUpdatedCells().catch(attendanceSheetUpdateErrorCallback);

    doc.sheetsApi
        .post(
            `https://sheets.googleapis.com/v4/spreadsheets/${doc.spreadsheetId}:batchUpdate`,
            {
                requests: [
                    gradientRule(
                        weekSheet.sheetId,
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
                    updateDimension(weekSheet.sheetId, "COLUMNS", 200, 0, 1),
                    updateDimension(weekSheet.sheetId, "COLUMNS", 200, 4, 6),
                    updateDimension(weekSheet.sheetId, "COLUMNS", 135, 8),
                    updateDimension(weekSheet.sheetId, "COLUMNS", 50, 9),
                    basicFilterView(weekSheet.sheetId, 0, 3, "Email"),
                ],
            }
        )
        .catch(attendanceSheetUpdateErrorCallback);

    logger.debug("Attendance exported successfully");
};

export default exportAttendanceHandler;

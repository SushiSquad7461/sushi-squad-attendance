import * as logger from "firebase-functions/logger";
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import emailRegex from "../util/email-regex";
import Attendances from "../models/attendance";
import { minutesFromTime, validMeetingTimes } from "../util/datetime";
import Users from "../models/user";
import Meetings, { getMeetingByDate } from "../models/meeting";

/** can submit attendance log 30 minutes before or after the meeting */
const VALID_MEETING_TIME_EPSILON = 130; // minutes

const logAttendanceHandler = async (request: CallableRequest) => {
    const { email, description } = request.data;
    logger.debug(`Attendance log requested for email ${email}: ${description}`);
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
                validMeetingDay.start - VALID_MEETING_TIME_EPSILON <= minutes &&
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
            throw new HttpsError("already-exists", "Already logged attendance");
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
};

export default logAttendanceHandler;

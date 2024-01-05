import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import NotionClient from "../util/notion-client";
import { dateFromPacificDateStr, pacificDateStr } from "../util/datetime";
import { Database, Model } from "./model";

class Meeting implements Model {
    public readonly id: string;
    public readonly date: Date;

    constructor(meetingResponse: PageObjectResponse) {
        if (
            !meetingResponse.properties.Date ||
            meetingResponse.properties.Date.type !== "date"
        )
            throw new Error("Meeting date is undefined");
        if (!meetingResponse.properties.Date.date?.start)
            throw new Error("Meeting date is undefined");

        this.id = meetingResponse.id;
        this.date = dateFromPacificDateStr(
            meetingResponse.properties.Date.date.start
        );
    }
}

const Meetings: Database<Meeting, { date: Date }, { onOrAfter: Date }> = {
    async create({ date }) {
        const response = await NotionClient.createSimplePageInDatabase(
            process.env.NOTION_MEETINGS_DBID,
            "Name",
            `${pacificDateStr(date)}`,
            {
                Date: {
                    type: "date",
                    date: {
                        start: pacificDateStr(date),
                        time_zone: "America/Los_Angeles",
                    },
                },
            }
        );
        if (!(response as PageObjectResponse).properties) {
            throw new Error(
                "Notion API returned PartialPageObjectReseponse on page creation"
            );
        }

        return new Meeting(response as PageObjectResponse);
    },

    async query({ onOrAfter }) {
        const results = await NotionClient.queryAllDatabase(
            process.env.NOTION_MEETINGS_DBID,
            {
                property: "Date",
                date: {
                    on_or_after: pacificDateStr(onOrAfter),
                },
            }
        );
        const meetings: Meeting[] = [];
        for (const result of results) {
            if (!(result as PageObjectResponse).properties) continue;
            meetings.push(new Meeting(result as PageObjectResponse));
        }
        return meetings;
    },

    async getById(id: string) {
        const response = await NotionClient.getPageById(id);
        if (!(response as PageObjectResponse).properties) {
            throw new Error(
                "Notion API returned PartialPageObjectReseponse on page retrieval"
            );
        }
        return new Meeting(response as PageObjectResponse);
    },
};

const getMeetingByDate = async (date: Date) => {
    const response = await NotionClient.queryDatabaseForDate(
        process.env.NOTION_MEETINGS_DBID,
        date
    );
    if (!response) return null;
    if (!(response as PageObjectResponse).properties) {
        throw new Error(
            "Notion API returned PartialPageObjectReseponse on page retrieval"
        );
    }
    return new Meeting(response as PageObjectResponse);
};

export { type Meeting, getMeetingByDate };

export default Meetings;

import {
    BlockObjectRequest,
    PageObjectResponse,
    PersonUserObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import NotionClient, { PropertyFilter, text } from "../util/notion-client";
import { pacificDateStr } from "../util/datetime";
import { Database, Model } from "./model";
import type { Meeting } from "./meeting";

class Attendance implements Model {
    public readonly id: string;
    public readonly user: PersonUserObjectResponse;
    public readonly meetingId: string;

    constructor(attendanceResponse: PageObjectResponse) {
        if (!attendanceResponse.properties)
            throw new Error("Attendance properties are undefined");

        if (
            !attendanceResponse.properties.Person ||
            attendanceResponse.properties.Person.type !== "people" ||
            !attendanceResponse.properties.Person.people.length
        )
            throw new Error("Attendance person is undefined");

        const person = attendanceResponse.properties.Person
            .people[0] as PersonUserObjectResponse;
        if ((person as PersonUserObjectResponse).type !== "person")
            throw new Error("Attendance person is not a person");

        if (
            attendanceResponse.properties["Engineering Notebook"]?.type !==
            "relation"
        )
            throw new Error("Attendance meeting is not a relation");

        this.id = attendanceResponse.id;
        this.user = person;
        this.meetingId =
            attendanceResponse.properties[
                "Engineering Notebook"
            ].relation[0]?.id;
    }
}

export type { Attendance };

const Attendances: Database<
    Attendance,
    { user: PersonUserObjectResponse; meeting: Meeting; description?: string },
    {
        userId?: string;
        meetingId?: string;
        onOrAfter?: Date;
    }
> = {
    async create({ user, meeting, description = undefined }) {
        const children: BlockObjectRequest[] = [
            {
                type: "paragraph",
                paragraph: text(
                    "Attendance logged via https://sushisquad.org/sushi-squad-attendance"
                ),
            },
        ];
        if (description) {
            children.push({
                type: "heading_2",
                heading_2: text("Description"),
            });
            children.push({
                type: "paragraph",
                paragraph: text(description),
            });
        }

        const reponse = await NotionClient.createSimplePageInDatabase(
            process.env.NOTION_ATTENDANCE_DBID,
            "Title",
            `${user.name} ${pacificDateStr(meeting.date)}`,
            {
                Person: {
                    type: "people",
                    people: [
                        {
                            id: user.id,
                        },
                    ],
                },
                "Engineering Notebook": {
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

        if (!(reponse as PageObjectResponse).properties) {
            throw new Error(
                "Notion API returned PartialPageObjectReseponse on page creation"
            );
        }

        return new Attendance(reponse as PageObjectResponse);
    },

    async query({ userId, meetingId, onOrAfter }) {
        const filters: PropertyFilter[] = [];
        if (userId) {
            filters.push({
                property: "Person",
                type: "people",
                people: {
                    contains: userId,
                },
            });
        }
        if (meetingId) {
            filters.push({
                property: "Engineering Notebook",
                relation: {
                    contains: meetingId,
                },
            });
        } else {
            // if a meeting id is not specified, we want
            // to make sure all the results hav one set
            filters.push({
                property: "Engineering Notebook",
                relation: {
                    is_not_empty: true,
                },
            });
        }
        if (onOrAfter) {
            filters.push({
                property: "Date Created",
                date: {
                    on_or_after: pacificDateStr(onOrAfter),
                },
            });
        }
        const results = await NotionClient.queryAllDatabase(
            process.env.NOTION_ATTENDANCE_DBID,
            ...filters
        );
        const attendances: Attendance[] = [];
        for (const result of results) {
            if (!(result as PageObjectResponse).properties) continue;
            attendances.push(new Attendance(result as PageObjectResponse));
        }

        return attendances;
    },

    async getById(id: string) {
        const response = await NotionClient.getPageById(id);
        if (!(response as PageObjectResponse).properties) {
            throw new Error(
                "Notion API returned PartialPageObjectReseponse on page retrieval"
            );
        }
        return new Attendance(response as PageObjectResponse);
    },
};

export default Attendances;

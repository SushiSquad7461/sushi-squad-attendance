import {Client} from "@notionhq/client";
import type {
    BlockObjectRequest,
    CreatePageParameters,
    PersonUserObjectResponse,
    QueryDatabaseParameters,
} from "@notionhq/client/build/src/api-endpoints";

class NotionClient {
    private static client = new Client({
        auth: process.env.NOTION_TOKEN,
    });

    /**
     * Finds a user in the Notion workspace
     *
     * @param email
     *
     * @return the user or undefined if not found
     */
    public static async findUser(email: string) {
        const notionUsers = await NotionClient.client.users.list({});
        const user = notionUsers.results.find(
            (u) => u.type === "person" && u.person.email === email
        ) as PersonUserObjectResponse | undefined;
        return user;
    }

    /**
     * Searches the database specified for an entry with a matching date in the "Date" property
     *
     * @param dbid
     * @param date
     *
     * @return the first match or undefined if not found
     */
    public static async queryDatabaseForDate(dbid: string, date: Date) {
        const response = await NotionClient.client.databases.query({
            database_id: dbid,
            filter: {
                property: "Date",
                date: {
                    equals: date.toISOString().split("T")[0],
                },
            },
        });
        return response.results[0];
    }

    /**
     * Searches the database specified for all entries matching the filters.
     * @param dbid
     * @param filter
     * @returns
     */
    public static async queryAllDatabase(
        dbid: string,
        ...filters: Array<
            Extract<QueryDatabaseParameters["filter"], { property: string }>
        >
    ) {
        const response = await NotionClient.client.databases.query({
            database_id: dbid,
            filter: {
                and: filters,
            },
        });
        return response.results;
    }

    /**
     * Searches the database specified for an entry matching the filters.
     * @param dbid
     * @param filter
     * @return First result or undefined if not found
     */
    public static async queryDatabase(
        dbid: string,
        ...filters: Array<
            Extract<QueryDatabaseParameters["filter"], { property: string }>
        >
    ) {
        const results = await NotionClient.queryAllDatabase(dbid, ...filters);
        return results[0];
    }

    /**
     * Create a page in the database specified with a title, date, and 
     * optionally children
     *
     * @param dbid The database to create the page in
     * @param title Value to set the "titleKey" property to
     * @param titleKey The name of the title property
     * @param date Optional value to set the "Date" property to
     * @param children The content shown when the page is opened
     *
     * @return Info about the created page
     */
    public static async createSimplePageInDatabase(
        dbid: string,
        titleKey: string,
        title: string,
        properties: CreatePageParameters["properties"],
        children: BlockObjectRequest[] = []
    ) {
        const params: CreatePageParameters = {
            parent: {
                database_id: dbid,
            },
            properties,
            children,
        };
        params.properties[titleKey] = {
            type: "title",
            title: [
                {
                    type: "text",
                    text: {
                        content: title,
                    },
                },
            ],
        };
        return await NotionClient.client.pages.create(params);
    } 
    
}

/**
 * Get the current date in the Pacific timezone as a string
 * @param date 
 * @returns Date in the format MM/DD/YY
 */
function pacificDateStr(date: Date) {
    return date.toLocaleDateString(
        "en-US",
        {
            month: "numeric",
            day: "numeric",
            year: "2-digit",
            timeZone: "America/Los_Angeles",
        }
    );
}


/**
 * Get text in the format Notion expects
 * @param text 
 * @returns 
 */
function text(text: string) {
    return {
        rich_text: [
            {
                text: {
                    content: text,
                },
            },
        ],
    };
}

export {pacificDateStr, text};

export default NotionClient;

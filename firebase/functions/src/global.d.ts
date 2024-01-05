declare global {
    namespace NodeJS {
        interface ProcessEnv {
            readonly NODE_ENV: "development" | "production" | "test";
            readonly NOTION_ATTENDANCE_DBID: string;
            readonly NOTION_MEETINGS_DBID: string;
            readonly NOTION_TOKEN: string;
            readonly GOOGLE_ATTENDANCE_SHEET_ID: string;
            readonly GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
            readonly GOOGLE_PRIVATE_KEY: string;
            readonly NOTION_BOT_USER_ID: string;
            readonly GOOGLE_ATTENDANCE_AGGREGATE_WORKSHEET_ID: string;
        }
    }
}

export {};

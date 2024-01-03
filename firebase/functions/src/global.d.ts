declare global {
    namespace NodeJS {
        interface ProcessEnv {
            readonly NODE_ENV: "development" | "production" | "test";
            readonly NOTION_ATTENDANCE_DBID: string;
            readonly NOTION_MEETINGS_DBID: string;
            readonly NOTION_TOKEN: string;
        }
    }
}

export {}
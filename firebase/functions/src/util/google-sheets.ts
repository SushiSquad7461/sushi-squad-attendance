import { JWT } from "google-auth-library";
import {
    GoogleSpreadsheet,
    GoogleSpreadsheetWorksheet,
} from "google-spreadsheet";

export type Color = { red?: number; green?: number; blue?: number };
export type ColorRule = {
    color: Color;
    type: "NUMBER";
    value: string;
};

export function gradientRule(
    sheetId: number,
    range: {
        startRowIndex?: number;
        endRowIndex?: number;
        startColumnIndex?: number;
        endColumnIndex?: number;
    },
    colorRules: {
        minpoint: ColorRule;
        midpoint?: ColorRule;
        maxpoint?: ColorRule;
    }
) {
    const { startRowIndex, endRowIndex, startColumnIndex, endColumnIndex } =
        range;
    const rangeRule: Record<string, number> = {
        sheetId,
    };
    if (startRowIndex) rangeRule.startRowIndex = startRowIndex;
    if (endRowIndex) rangeRule.endRowIndex = endRowIndex;
    if (startColumnIndex) rangeRule.startColumnIndex = startColumnIndex;
    if (endColumnIndex) rangeRule.endColumnIndex = endColumnIndex;

    return {
        addConditionalFormatRule: {
            rule: {
                ranges: [rangeRule],
                gradientRule: colorRules,
            },
            index: 0,
        },
    };
}

export function updateDimension(
    sheetId: number,
    dimension: "ROWS" | "COLUMNS",
    pixelSize: number,
    startIndex: number,
    endIndex: number | null = null
) {
    return {
        updateDimensionProperties: {
            range: {
                sheetId,
                dimension,
                startIndex,
                endIndex: endIndex ?? startIndex + 1,
            },
            properties: {
                pixelSize,
            },
            fields: "pixelSize",
        },
    };
}

export function basicFilterView(
    sheetId: number,
    startColumnIndex: number,
    endColumnIndex: number,
    sortColumnName: string,
    sortOrder: "ASCENDING" | "DESCENDING" = "ASCENDING"
) {
    return {
        setBasicFilter: {
            filter: {
                range: {
                    sheetId,
                    startColumnIndex,
                    endColumnIndex,
                },
                sortSpecs: [
                    {
                        sortOrder,
                        dataSourceColumnReference: {
                            name: sortColumnName,
                        },
                    },
                ],
            },
        },
    };
}

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

export function googleSpreadsheet(spreadsheetId: string) {
    return new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
}

/**
 * Load the doc info before calling this
 * @param doc
 * @param sheetTitle
 * @returns
 */
export function getSheet(
    doc: GoogleSpreadsheet,
    sheetTitle: string
): Promise<GoogleSpreadsheetWorksheet> {
    const sheet = doc.sheetsByTitle[sheetTitle];
    if (!sheet) return doc.addSheet({ title: sheetTitle });
    return new Promise((resolve) => resolve(sheet));
}

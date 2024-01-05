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

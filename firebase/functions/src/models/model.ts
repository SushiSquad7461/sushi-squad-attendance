export interface Database<T extends Model, CreateParams, QueryParams> {
    create(args: CreateParams): Promise<T>;
    query(args: QueryParams): Promise<T[]>;
    getById(id: string): Promise<T>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

export interface Model<> {
    readonly id: string;
}

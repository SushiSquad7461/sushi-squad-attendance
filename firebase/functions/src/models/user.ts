import { UserObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { Database, Model } from "./model";
import NotionClient from "../util/notion-client";

class User implements Model {
    public readonly id: string;
    public readonly type: "person" | "bot" = "person";
    public readonly name?: string;
    public readonly email?: string;

    constructor(userResponse: UserObjectResponse) {
        if (userResponse.type === "person") {
            if (!userResponse.person.email)
                throw new Error("User email is undefined");
            if (!userResponse.name) throw new Error("User name is undefined");
            this.name = userResponse.name;
            this.email = userResponse.person.email;
            this.type = "person";
        } else if (userResponse.type === "bot") {
            if (userResponse.name) this.name = userResponse.name;
            this.type = "bot";
        }

        this.id = userResponse.id;
    }
}

export { User };

let usersCache: UserObjectResponse[] | undefined;

const Users: Database<User, undefined, { email?: string }> = {
    create() {
        throw new Error("Not implemented");
    },

    async query({ email }) {
        if (!usersCache) {
            usersCache = await NotionClient.allUsers();
        }
        if (email) {
            const user = await NotionClient.findUser(email, usersCache);
            if (!user) return [];
            return [new User(user)];
        }
        return usersCache.map((u) => new User(u));
    },

    async getById(id) {
        const result = await NotionClient.findUserById(id);
        return new User(result);
    },
};

export default Users;

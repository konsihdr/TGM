import {
    Bot,
    Context,
    session,
    SessionFlavor,
} from "https://deno.land/x/grammy@v1.21.1/mod.ts";
import {freeStorage} from "https://deno.land/x/grammy_storages@v2.4.2/free/src/mod.ts";

const ADMIN_Group = -1002103808557
// Define the session structure.
type SessionData = {
    group_url: string,
    group_name: string,
    active: false,
    banned: false,
    group_id: number,
    is_admin: false,
    date_added: string,
    date_modified: string
}
type MyContext = Context & SessionFlavor<SessionData>;

// Create the bot and register the session middleware.
const bot = new Bot<MyContext>("5645084229:AAE9ykbfTtYQgpRWxpqEawHFh_xNeNykegA");

bot.use(session({
    initial: () => ({
        group_url: '',
        group_name: '',
        active: false,
        banned: false,
        group_id: 1,
        is_admin: false,
        date_added: '',
        date_modified: ''
    }),
    getSessionKey: (ctx) => ctx.chat?.id.toString(),
    storage: freeStorage<SessionData>(bot.token),
}));


bot.on("my_chat_member:from:me", async (ctx) => {
    console.log('Added to a Group or Removed')
    const chatType = ctx.chat.type;
    const newStatus = ctx.myChatMember.new_chat_member.status;
    const isBot = ctx.myChatMember.new_chat_member.user.is_bot;
    console.log("Group Username: ", "Chat Type: ", chatType, "New Status: ", newStatus, "Is Bot: ", isBot)

    // Check if the bot is added to a group or supergroup, not a channel
    if (chatType === "supergroup") {
        // Perform additional checks for supergroup, e.g., check for Username
        if (ctx.chat.username) {

            // Your code here for supergroup and a public link

            console.log('Group ID 3: ', ctx.chat.id)
            await ctx.reply("Der Bot ist kein Admin... Ist aber nicht wichtig");
            await ctx.api.sendMessage(ADMIN_Group, 'Joined new supergroup with an username: https://t.me/' + ctx.chat.username);


        } else {
            // Your code here for supergroup and no public group link

            console.log('Group ID 2: ', ctx.chat.id)

            await ctx.reply("Der Bot ist kein Admin... Bla Bla");
            await ctx.api.sendMessage(ADMIN_Group, 'Joined new supergroup with no link');
        }


    } else if (chatType === "group") {
        // Your code here for groups

        console.log('Group ID: ', ctx.chat.id)
        await ctx.reply("Der Bot ist kein Admin... Bla Bla");
        await ctx.api.sendMessage(ADMIN_Group, 'Joined new group with no link');
    }


});
// Use persistent session data in update handlers.
bot.on("message", async (ctx) => {
    await ctx.reply("Hallo :D");
})

bot.catch((err) => console.error(err));
bot.start();

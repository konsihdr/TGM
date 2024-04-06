import {
    Bot,
    Context,
    session,
    SessionFlavor,
    BotError,
} from "https://deno.land/x/grammy@v1.21.1/mod.ts";
import "https://deno.land/std@0.221.0/dotenv/load.ts";
import { freeStorage } from "https://deno.land/x/grammy_storages@v2.4.2/free/src/mod.ts";
import { Chat } from "https://deno.land/x/grammy_types@v3.5.2/manage.ts";
import SupergroupChat = Chat.SupergroupChat;

const ADMIN_GROUP = -1002103808557;

// Define the session structure
type SessionData = {
    group_url: string;
    group_name: string;
    active: boolean;
    banned: boolean;
    group_id: number;
    is_admin: boolean;
    date_added: string;
    date_modified: string;
};

type MyContext = Context & SessionFlavor<SessionData>;

// Create the bot instance
const bot = new Bot<MyContext>(Deno.env.get("BOT_TOKEN")!);

// Register the session middleware
bot.use(
    session({
        initial: () => ({
            group_url: "",
            group_name: "",
            active: false,
            banned: false,
            group_id: 1,
            is_admin: false,
            date_added: "",
            date_modified: "",
        }),
        getSessionKey: (ctx) => String(ctx.chat?.id),
        storage: freeStorage<SessionData>(bot.token),
    })
);

// Handler for when the bot is added to a group or removed
bot.on("my_chat_member", async (ctx) => {
    const chatType = ctx.chat?.type;
    const newStatus = ctx.myChatMember?.new_chat_member.status;
    const isBot = ctx.myChatMember?.new_chat_member.user.is_bot;

    if ((newStatus === "member" || newStatus === "administrator") && isBot) {
        if (chatType === "supergroup") {
            const supergroupChat = ctx.chat as SupergroupChat;

            if (!supergroupChat.username) {
                await handleSupergroupWithoutUsername(ctx, chatType);
            } else {
                await handleSupergroupWithUsername(ctx, chatType, supergroupChat);
            }
        } else if (chatType === "group") {
            await handleGroup(ctx, chatType);
        }
    }
});

// Handler for callback queries
bot.on("callback_query:data", async (ctx) => {
    const [action, inviteId] = ctx.callbackQuery.data.split("_") ?? "h";

    if (action === "accept") {
        await handleAcceptAction(ctx);
    } else if (action === "deny") {
        await handleDenyAction(ctx);
    }
});

// Error handling
bot.catch((err: BotError<MyContext>) => {
    console.error(err.error);
});

// Start the bot
bot.start();

// Helper functions

async function handleSupergroupWithoutUsername(ctx: MyContext, chatType: string) {
    if (!ctx.chat?.id) {
        return await ctx.reply("Chat ID is missing.");
    }
    if (ctx.chat?.type == "private") {
        return await ctx.reply("This is not a group.");
    }
    try {
       
        const inviteLink = await ctx.api.createChatInviteLink(ctx.chat?.id ?? "h");
        const inviteId = ctx.chat.id;
        const message = `Bot added to a ${chatType}. Invite link: ${inviteLink.invite_link}`;

        await sendInviteLinkMessage(ctx, message, inviteId);
    } catch (error) {
        console.error("Failed to create an invite link. Error: ", error);
        await ctx.reply("I can't create an invite link. Please check my permissions.");
        await ctx.api.sendMessage(
            ADMIN_GROUP,
            `Bot added to a ${chatType}, but couldn't create an invite link due to insufficient permissions ${ctx.chat.title}.`
        );
    }
}

async function handleSupergroupWithUsername(
    ctx: MyContext,
    chatType: string,
    supergroupChat: SupergroupChat
) {
    const message = `Bot added to a supergroup with public username @${supergroupChat.username}. No invite link generated.`;
    await ctx.api.sendMessage(ADMIN_GROUP, message);
}

async function handleGroup(ctx: MyContext, chatType: string) {
    if (!ctx.chat?.id) {
        return await ctx.reply("Chat ID is missing.");
    }
    if (ctx.chat?.type == "private") {
        return await ctx.reply("This is not a group.");
    }
    try {
        const inviteLink = await ctx.api.createChatInviteLink(ctx.chat.id);
        const inviteId = ctx.chat?.id ?? 111;
        const message = `Bot added to a ${chatType}. Invite link: ${inviteLink.invite_link}`;

        await sendInviteLinkMessage(ctx, message, inviteId);
    } catch (error) {
        console.error("Failed to create an invite link. Error: ", error);
        await ctx.reply("I can't create an invite link. Please check my permissions.");
        await ctx.api.sendMessage(
            ADMIN_GROUP,
            `Bot added to a ${chatType}, but couldn't create an invite link due to insufficient permissions ${ctx.chat.title}.`
        );
    }
}

async function sendInviteLinkMessage(ctx: MyContext, message: string, inviteId: number) {
    await ctx.api.sendMessage(ADMIN_GROUP, message, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "Accept", callback_data: `accept_${inviteId}` },
                    { text: "Deny", callback_data: `deny_${inviteId}` },
                ],
            ],
        },
    });
}

async function handleAcceptAction(ctx: MyContext) {
    await ctx.answerCallbackQuery({ text: "You accepted the invite." });
    // Further processing, like saving the invitation as accepted
}

async function handleDenyAction(ctx: MyContext) {
    await ctx.answerCallbackQuery({ text: "You denied the invite." });
    // Further processing, like marking the invitation as denied
}


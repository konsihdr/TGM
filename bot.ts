// demo-lint-ignore-file no-unused-vars
import {
  Bot,
  BotError,
  Context,
  session,
  SessionFlavor,
} from 'https://deno.land/x/grammy@v1.23.0/mod.ts';
import "https://deno.land/std@0.221.0/dotenv/load.ts";
import { freeStorage } from "https://deno.land/x/grammy_storages@v2.4.2/free/src/mod.ts";
import { run } from "https://deno.land/x/grammy_runner@v2.0.3/mod.ts";
import Group from "./models/groups.ts";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import {createConversation, Conversation, ConversationFlavor, conversations } from "https://deno.land/x/grammy_conversations@v1.2.0/mod.ts";
import {stringify} from "https://deno.land/x/oson@1.0.1/oson.ts";


const secretKey = new TextEncoder().encode(Deno.env.get("HMAC")!);

const ADMIN_GROUP = -1002103808557;

// Define the session structure
type SessionData = {
  group_url: string;
  group_name: string;
  active: boolean;
  banned: boolean;
  group_id: string;
  is_admin: boolean;
  date_added: string;
  date_modified: string;
};

type MyContext = Context & ConversationFlavor & SessionFlavor<SessionData>;



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
      group_id: "none",
      is_admin: false,
      date_added: "",
      date_modified: "",
    }),
    getSessionKey: (ctx) => String(ctx.chat?.id),
    storage: freeStorage<SessionData>(bot.token),
  }),
);

bot.use(conversations());
bot.use(createConversation(verifyGroupListConversation));


bot.on("chat_member", async (ctx) => {
  const newStatus = ctx.chatMember?.new_chat_member.status;
  const isBot = ctx.chatMember?.new_chat_member.user.is_bot;
  const newMemberId = ctx.chatMember?.new_chat_member.user.id;
  const botId = bot.botInfo.id;

  if (newStatus === "administrator" && isBot && newMemberId === botId) {
    // The bot itself has been promoted to an admin
    // Retry creating an invitation link
    const chatType = ctx.chat?.type;
    if (chatType === "supergroup" && !ctx.chat?.username) {
      await handleSupergroupWithoutUsername(ctx, chatType);
    }
  }
});

// Handler for when the bot is added to a group or removed
bot.on("my_chat_member", async (ctx) => {
  const chatType = ctx.chat?.type;
  const newStatus = ctx.myChatMember?.new_chat_member.status;
  const isBot = ctx.myChatMember?.new_chat_member.user.is_bot;

  if ((newStatus === "member" || newStatus === "administrator") && isBot) {
    // Set default session data
    ctx.session.group_url = "none";
    if ("title" in ctx.chat) {
      ctx.session.group_name = ctx.chat.title || "none";
    } else {
      ctx.session.group_name = "none"; // or any default value
    }
    ctx.session.active = false;
    ctx.session.banned = false;
    ctx.session.group_id = String(ctx.chat?.id) ?? "none"; // Use the group id from the chat context
    ctx.session.is_admin = false;
    ctx.session.date_added = new Date().toISOString();
    ctx.session.date_modified = new Date().toISOString();

    if (chatType === "supergroup") {
      const supergroupChat = ctx.chat;

      if (!supergroupChat.username) {
        await handleSupergroupWithoutUsername(ctx, chatType);
      } else {
        await handleSupergroupWithUsername(ctx, chatType, supergroupChat);
      }
    } else if (chatType === "group") {
      await handleGroup(ctx, chatType);
    }

    // Find the group in the database
    const group = await Group.findOne({ tg_id: ctx.chat.id });

    // If the group doesn't exist, create a new one
    if (!group) {
      let joinedDate = new Date(ctx.session.date_added);
      if (isNaN(joinedDate.getTime())) {
        // If not valid, use the current date
        joinedDate = new Date();
      }
      await Group.create({
        name: ctx.session.group_name,
        tg_id: ctx.session.group_id,
        joined: joinedDate,
        active: ctx.session.active,
        is_admin: ctx.session.is_admin,
      });
    }
  }
});
// Handler for callback queries
bot.on("callback_query:data", async (ctx) => {
  const [action, _inviteId] = ctx.callbackQuery.data.split("_") ?? "h";

  if (action === "accept") {
    await handleAcceptAction(ctx);
  } else if (action === "deny") {
    await handleDenyAction(ctx);
  }
});

bot.command("start", async (ctx) => {
  await ctx.reply("Hello! I am a bot that can help you manage your groups.");
});

bot.command("send_group_list", async (ctx) => {
  try {
    const activeGroups = await Group.find({ active: true, invite_link: { $ne: "" } }).sort({ name: 1 });

    console.log("Active Groups:", activeGroups); // Debugging log

    const replyText = ["<b>🌟 Aktive Gruppenliste 🌟</b>\n"];
    replyText.push("Hier ist eine Liste der aktiven DACH-Gruppen mit ihren Einladungslinks:\n");

    for (const group of activeGroups) {
      if (group.invite_link) { // Check if invite_link exists
        const escapedGroupName = escapeHTML(group.name);
        const inviteLink = group.invite_link;
        replyText.push(`· <a href="${inviteLink}">${escapedGroupName}</a>`);
      }
    }

    // Add current date and time
    const currentDate = new Date().toLocaleString("de-DE", { dateStyle: 'full', timeStyle: 'short' });
    replyText.push(`\n<b>Stand zum:</b> ${currentDate}`);

    // Generate and add HMAC
    const messageContent = replyText.join("\n");
    const plainText = removeNewlinesAndSpaces(stripHtmlTags(messageContent));
    const hmac = await generateHMAC(plainText);
    replyText.push(`\n<b>HMAC:</b> ${hmac}`);

    let formattedMessage = replyText.join("\n");
    const maxLength = 4096;

    while (formattedMessage.length > maxLength) {
      const splitIndex = formattedMessage.lastIndexOf('\n', maxLength);
      const partMessage = formattedMessage.slice(0, splitIndex);
      formattedMessage = formattedMessage.slice(splitIndex + 1);
      await ctx.reply(partMessage, {
        link_preview_options: {
          is_disabled: true,
        },
        parse_mode: "HTML",
      });
    }

    await ctx.reply(formattedMessage, {
      link_preview_options: {
        is_disabled: true,
      },
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error("Error fetching group list:", error);
    await ctx.reply("Ein Fehler ist beim Abrufen der Gruppenliste aufgetreten. Bitte versuche es später erneut.");
  }
});

bot.command("verify_group_list", async (ctx) => {
  await ctx.conversation.enter("verifyGroupListConversation");
});

// Error handling
bot.catch((err: BotError<MyContext>) => {
  console.error(err.error);
});

// Start the bot
run(bot);

// Helper functions
// Function to verify HMAC
async function verifyHMAC(message: string, receivedHMAC: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const key = await crypto.subtle.importKey(
      "raw",
      secretKey,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
  );
  const receivedSignature = Uint8Array.from(receivedHMAC.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  return await crypto.subtle.verify("HMAC", key, receivedSignature, data);
}

// Strip HTML tags
function stripHtmlTags(html: string): string {
  return html.replace(/<\/?[^>]+(>|$)/g, "");
}

// Remove newlines and spaces
function removeNewlinesAndSpaces(text: string): string {
  return text.replace(/\s+/g, "");
}


// Conversation for verifying the group list
async function verifyGroupListConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
  await ctx.reply("Bitte senden Sie die vollständige Nachricht mit der Gruppenliste und HMAC zur Überprüfung.");

  const { message } = await conversation.waitFor("message:text");
  const fullText = message.text;

  // Extract the HMAC from the message
  const hmacRegex = /HMAC:\s*([a-fA-F0-9]{64})/;
  const match = fullText.match(hmacRegex);

  if (!match || match.length < 2) {
    await ctx.reply("HMAC nicht gefunden.");
    return;
  }

  const receivedHMAC = match[1];
  // Remove the HMAC part from the message
  const originalMessage = fullText.replace(hmacRegex, "").trim();

  const isValid = await verifyHMAC(originalMessage, receivedHMAC);

  if (isValid) {
    await ctx.reply("Die HMAC ist gültig.");
  } else {
    await ctx.reply("Die HMAC ist ungültig.");
  }

}

async function handleSupergroupWithoutUsername(
  ctx: MyContext,
  chatType: string,
) {
  if (!ctx.chat?.id) {
    return await ctx.reply("Chat ID is missing.");
  }
  if (ctx.chat?.type == "private") {
    return await ctx.reply("This is not a group.");
  }
  try {
    const inviteLink = await ctx.api.createChatInviteLink(ctx.chat?.id ?? "h");
    const inviteId = ctx.chat.id;
    const message =
      `Bot added to a ${chatType}. Invite link: ${inviteLink.invite_link} 2`;
    await Group.updateOne(
      { tg_id: ctx.chat.id },
      {
        invite_link: inviteLink.invite_link,
      },
    );
    await sendInviteLinkMessage(ctx, message, inviteId);
  } catch (error) {
    console.error("Failed to create an invite link. Error: ", error);
    await ctx.reply(
      "I can't create an invite link. Please check my permissions.",
    );
    //const inviteId = ctx.chat.id;
    /*await ctx.api.sendMessage(
            ADMIN_GROUP,
            `Bot added to a ${chatType}, but couldn't create an invitation link due to insufficient permissions ${ctx.chat.title}.`);
    */
  }
}

// Function to escape HTML characters
function escapeHTML(text: string): string {
  return text.replace(/[&<>"'`]/g, (char) => {
    const escapeChars: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "`": "&#96;",
    };
    return escapeChars[char] || char;
  });
}

async function generateHMAC(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const key = await crypto.subtle.importKey(
    "raw",
    secretKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function handleSupergroupWithUsername(
  ctx: MyContext | undefined,
  _chatType: string,
  // deno-lint-ignore no-explicit-any
  supergroupChat: any,
) {
  if (ctx?.chat) {
    const message =
      `Bot added to a supergroup with public username @${supergroupChat.username}. No invite link generated.`;
    const inviteId = ctx.chat.id;
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
    const message =
      `Bot added to a ${chatType}. Invite link: ${inviteLink.invite_link} 1`;
    // Update the group in the database
    await Group.updateOne(
      { tg_id: ctx.chat.id },
      {
        invite_link: inviteLink.invite_link,
      },
    );
    await sendInviteLinkMessage(ctx, message, inviteId);
  } catch (error) {
    console.error("Failed to create an invite link. Error: ", error);
    await ctx.reply(
      "I can't create an invite link. Please check my permissions.",
    );
    await ctx.api.sendMessage(
      ADMIN_GROUP,
      `Bot added to a ${chatType}, but couldn't create an invite link due to insufficient permissions ${ctx.chat.title}.`,
    );
  }
}

async function sendInviteLinkMessage(
  ctx: MyContext,
  message: string,
  inviteId: number,
) {
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

  // Extract the invite ID from the callback data
  const inviteId = ctx.callbackQuery?.data?.split("_")[1];

  if (!inviteId) {
    console.error("Invite ID is undefined");
    return;
  }

  // Update the session data to mark the invitation as accepted
  ctx.session.active = true;
  ctx.session.banned = false;
  ctx.session.group_id = inviteId;
  ctx.session.date_modified = new Date().toISOString();

  // Update the group in the database
  await Group.updateOne(
    { tg_id: inviteId },
    {
      active: ctx.session.active,
      banned: ctx.session.banned,
      date_modified: ctx.session.date_modified,
    },
  );

  // Edit the message to switch the button from "Accept" to "Deny"
  await ctx.editMessageText(`The invitation for group ID ${inviteId} has been accepted.`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Gruppe doch entfernen", callback_data: `deny_${inviteId}` },
        ],
      ],
    },
  });

  // Send a message to the admin group indicating the acceptance
  await ctx.api.sendMessage(
    ADMIN_GROUP,
    `The invitation for group ID ${inviteId} has been accepted.`,
  );
}

async function handleDenyAction(ctx: MyContext) {
  await ctx.answerCallbackQuery({ text: "You denied the invite." });

  // Extract the invite ID from the callback data
  const inviteId = ctx.callbackQuery?.data?.split("_")[1];

  if (!inviteId) {
    console.error("Invite ID is undefined");
    return;
  }

  // Update the session data to mark the invitation as denied
  ctx.session.active = false;
  ctx.session.banned = true;
  ctx.session.group_id = inviteId;
  ctx.session.date_modified = new Date().toISOString();

  // Update the group in the database
  await Group.updateOne(
    { tg_id: inviteId },
    {
      active: ctx.session.active,
      banned: ctx.session.banned,
      date_modified: ctx.session.date_modified,
    },
  );

  // Edit the message to switch the button from "Deny" to "Accept"
  await ctx.editMessageText(`The invitation for group ID ${inviteId} has been denied.`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Gruppe wieder aufnehmen", callback_data: `accept_${inviteId}` },
        ],
      ],
    },
  });

  // Send a message to the admin group indicating the denial
  await ctx.api.sendMessage(
    ADMIN_GROUP,
    `The invitation for group ID ${inviteId} has been denied.`,
  );
}

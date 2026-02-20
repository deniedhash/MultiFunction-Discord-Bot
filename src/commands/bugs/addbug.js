const { PermissionFlagsBits } = require('discord.js');
const {
    ensureBugsCategory, ensureAddBugChannel, ensureBugListChannel,
    buildAddBugEmbed, buildAddBugButton, backfillBugList,
} = require('../../bugs/bugManager');
const { getGuildRepos } = require('../../github/store');

module.exports = {
    name: 'addbug',
    description: 'Set up bug tracking channels (bugs category, #add-bug, #bug-list)',
    category: 'Bugs',

    async prefixExecute(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('You need the **Manage Channels** permission to use this command.');
        }

        const repos = await getGuildRepos(message.guild.id);
        if (!repos || repos.length === 0) {
            return message.reply('No GitHub repos are tracked in this server. Use `!repo add owner/name` first.');
        }

        const guild = message.guild;
        const category = await ensureBugsCategory(guild);
        const addBugChannel = await ensureAddBugChannel(guild, category);
        await ensureBugListChannel(guild, category);

        // Check if the add-bug channel already has a pinned bug embed
        const pinsResult = await addBugChannel.messages.fetchPins();
        const pins = pinsResult.items || pinsResult;
        const botId = guild.members.me?.id;
        const alreadySetUp = botId && [...pins.values()].some(m => m.author?.id === botId && m.embeds.length > 0);

        if (!alreadySetUp) {
            const msg = await addBugChannel.send({
                embeds: [buildAddBugEmbed()],
                components: [buildAddBugButton()],
            });
            await msg.pin();
        }

        // Backfill any bugs that aren't in #bug-list yet
        await backfillBugList(message.client, guild.id);

        await message.reply(`Bug tracking is ready! Head to ${addBugChannel} to report bugs.`);
    },
};

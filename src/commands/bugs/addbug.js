const { PermissionFlagsBits } = require('discord.js');
const {
    ensureBugsCategory, ensureAddBugChannel, ensureBugListChannel,
    buildAddBugEmbed, buildAddBugButton,
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
        const pins = await addBugChannel.messages.fetchPins();
        const alreadySetUp = pins.items.some(m => m.author.id === message.client.user.id && m.embeds.length > 0);

        if (alreadySetUp) {
            return message.reply(`Bug tracking is already set up! See ${addBugChannel}.`);
        }

        const msg = await addBugChannel.send({
            embeds: [buildAddBugEmbed()],
            components: [buildAddBugButton()],
        });
        await msg.pin();

        await message.reply(`Bug tracking is ready! Head to ${addBugChannel} to report bugs.`);
    },
};

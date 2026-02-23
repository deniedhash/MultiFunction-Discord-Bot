const { PermissionFlagsBits } = require('discord.js');
const {
    ensureFeaturesCategoryGeneral, ensureAddFeatureChannel, ensureFeatureListChannel,
    buildAddFeatureEmbed, buildAddFeatureButton, backfillFeatureList,
} = require('../../features/featureManager');
const { getGuildRepoList } = require('../../github/repoSetupModel');

module.exports = {
    name: 'addfeature',
    description: 'Set up feature tracking channels (features category, #add-feature, #feature-list)',
    category: 'Features',

    async prefixExecute(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('You need the **Manage Channels** permission to use this command.');
        }

        const guild = message.guild;
        const category = await ensureFeaturesCategoryGeneral(guild);
        const addFeatureChannel = await ensureAddFeatureChannel(guild, category);
        await ensureFeatureListChannel(guild, category);

        // Check if the add-feature channel already has a pinned feature embed
        const pinsResult = await addFeatureChannel.messages.fetchPins();
        const pins = pinsResult.items || pinsResult;
        const botId = guild.members.me?.id;
        const alreadySetUp = botId && [...pins.values()].some(m => m.author?.id === botId && m.embeds.length > 0);

        if (!alreadySetUp) {
            const msg = await addFeatureChannel.send({
                embeds: [buildAddFeatureEmbed()],
                components: [buildAddFeatureButton()],
            });
            await msg.pin();
        }

        // Backfill any features that aren't in #feature-list yet
        await backfillFeatureList(message.client, guild.id);

        await message.reply(`Feature tracking is ready! Head to ${addFeatureChannel} to propose features.`);
    },
};

const { PermissionFlagsBits } = require('discord.js');
const {
    ensureIdeasCategory,
    ensureAddIdeaChannel,
    ensureIdeaListChannel,
    buildAddIdeaEmbed,
    buildAddIdeaButton,
    backfillIdeaList,
} = require('../../ideas/ideaManager');

module.exports = {
    name: 'addidea',
    description: 'Set up idea tracking channels (Product Ideas category, #add-idea)',
    category: 'Ideas',

    async prefixExecute(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('You need the **Manage Channels** permission to use this command.');
        }

        const guild = message.guild;
        const category = await ensureIdeasCategory(guild);
        const addIdeaChannel = await ensureAddIdeaChannel(guild, category);
        await ensureIdeaListChannel(guild, category);

        const pinsResult = await addIdeaChannel.messages.fetchPins();
        const pins = pinsResult.items || pinsResult;
        const botId = guild.members.me?.id;
        const alreadySetUp = botId && [...pins.values()].some(m => m.author?.id === botId && m.embeds.length > 0);

        if (!alreadySetUp) {
            const msg = await addIdeaChannel.send({
                embeds: [buildAddIdeaEmbed()],
                components: [buildAddIdeaButton()],
            });
            await msg.pin();
        }

        await backfillIdeaList(message.client, guild.id);

        await message.reply(`Idea tracking is ready! Head to ${addIdeaChannel} to submit ideas.`);
    },
};

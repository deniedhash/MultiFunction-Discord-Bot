const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { prefix } = require('../../../config');

function groupCommands(commands) {
    const grouped = {};
    for (const [, cmd] of commands) {
        const category = cmd.category || 'General';
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push(cmd);
    }
    return grouped;
}

function buildOverviewEmbed(grouped) {
    const embed = new EmbedBuilder()
        .setTitle('Bot Commands')
        .setDescription('Select a category from the dropdown to see its commands.')
        .setColor(0x5865f2)
        .setFooter({ text: `Prefix: ${prefix}` });

    const lines = Object.entries(grouped).map(
        ([cat, cmds]) => `**${cat}** — ${cmds.length} command${cmds.length === 1 ? '' : 's'}`,
    );
    embed.addFields({ name: 'Categories', value: lines.join('\n') });
    return embed;
}

function buildCategoryEmbed(category, cmds) {
    const embed = new EmbedBuilder()
        .setTitle(`${category} Commands`)
        .setColor(0x5865f2)
        .setFooter({ text: `Prefix: ${prefix}` });

    const lines = cmds.map((cmd) => {
        const aliases = cmd.aliases ? ` (${cmd.aliases.map(a => `\`${a}\``).join(', ')})` : '';
        return `\`${cmd.name}\`${aliases} — ${cmd.description}`;
    });
    embed.setDescription(lines.join('\n'));
    return embed;
}

function buildAllEmbed(grouped) {
    const embed = new EmbedBuilder()
        .setTitle('All Commands')
        .setColor(0x5865f2)
        .setFooter({ text: `Prefix: ${prefix}` });

    for (const [category, cmds] of Object.entries(grouped)) {
        const lines = cmds.map((cmd) => {
            const aliases = cmd.aliases ? ` (${cmd.aliases.map(a => `\`${a}\``).join(', ')})` : '';
            return `\`${cmd.name}\`${aliases} — ${cmd.description}`;
        });
        embed.addFields({ name: category, value: lines.join('\n') });
    }
    return embed;
}

function buildSelectMenu(grouped) {
    const options = Object.keys(grouped).map((cat) => ({
        label: cat,
        value: cat,
        description: `${grouped[cat].length} command${grouped[cat].length === 1 ? '' : 's'}`,
    }));
    options.push({ label: 'Show All', value: '__all__', description: 'Show all commands' });

    const menu = new StringSelectMenuBuilder()
        .setCustomId('help_category')
        .setPlaceholder('Pick a category...')
        .addOptions(options);

    return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
    name: 'help',
    aliases: ['h'],
    description: 'Lists all available commands',
    category: 'General',

    async prefixExecute(message) {
        const grouped = groupCommands(message.client.commands);
        const embed = buildOverviewEmbed(grouped);
        const row = buildSelectMenu(grouped);

        const reply = await message.reply({ embeds: [embed], components: [row] });

        const collector = reply.createMessageComponentCollector({
            filter: (i) => i.user.id === message.author.id,
            time: 60_000,
        });

        collector.on('collect', async (interaction) => {
            const value = interaction.values[0];
            let newEmbed;
            if (value === '__all__') {
                newEmbed = buildAllEmbed(grouped);
            } else {
                newEmbed = buildCategoryEmbed(value, grouped[value]);
            }
            await interaction.update({ embeds: [newEmbed], components: [row] });
        });

        collector.on('end', () => {
            const disabledRow = buildSelectMenu(grouped);
            disabledRow.components[0].setDisabled(true);
            reply.edit({ components: [disabledRow] }).catch(() => {});
        });
    },
};

module.exports = {
    name: 'note',
    aliases: ['n'],
    description: 'DM yourself a private note (message is deleted from the channel)',
    category: 'General',

    async prefixExecute(message, args) {
        const text = args.join(' ');

        if (!text) {
            return message.reply('Usage: `!note <text>` — sends you a private DM with your note.');
        }

        const embed = {
            color: 0x5865f2,
            title: 'Private Note',
            description: text,
            footer: { text: `From: ${message.guild.name}` },
            timestamp: new Date().toISOString(),
        };

        try {
            await message.author.send({ embeds: [embed] });
            await message.delete().catch(() => {});
        } catch {
            await message.reply(
                'Your DMs are closed. Please enable DMs in **Server Settings \u2192 Privacy** and run `!note` again.'
            );
        }
    },
};

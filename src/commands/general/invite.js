const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'invite',
    description: 'Get the bot invite link',
    category: 'General',

    async prefixExecute(message) {
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('Invite Me!')
            .setDescription('[Click here to add me to your server](https://discord.com/oauth2/authorize?client_id=1356829344718389278&permissions=8&integration_type=0&scope=bot)');

        await message.reply({ embeds: [embed] });
    },
};

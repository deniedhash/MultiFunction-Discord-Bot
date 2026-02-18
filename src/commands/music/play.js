const { createQueue, search } = require("../../music/queue");

// test

module.exports = {
  name: "play",
  aliases: ["pl"],
  description: "Play a song or add it to the queue",
  category: "Music",

  async prefixExecute(message, args) {
    const query = args.join(" ");
    if (!query) return message.reply("Please provide a song name or URL.");

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel)
      return message.reply("You need to be in a voice channel.");

    try {
      const track = await search(query);
      const queue = createQueue(
        message.guild.id,
        voiceChannel,
        message.channel,
      );
      queue.enqueue(track);

      if (!queue.playing) {
        await queue.playNext();
      } else {
        await message.reply(`Added to queue: **${track.title}**`);
      }
    } catch (error) {
      console.error(error);
      await message.reply(
        "Something went wrong while trying to play that track.",
      );
    }
  },
};

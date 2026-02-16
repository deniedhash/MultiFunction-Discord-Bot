const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
} = require('@discordjs/voice');
const ytdlp = require('./ytdlp');
const spotify = require('./spotify');

const queues = new Map();

class GuildQueue {
    constructor(guildId, voiceChannel, textChannel) {
        this.guildId = guildId;
        this.textChannel = textChannel;
        this.tracks = [];
        this.current = null;
        this.playing = false;

        this.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guildId,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        this.player = createAudioPlayer();
        this.connection.subscribe(this.player);

        this.player.on(AudioPlayerStatus.Idle, () => {
            this.playNext();
        });

        this.player.on('error', (error) => {
            console.error('Audio player error:', error.message);
            this.textChannel.send(`Player error: ${error.message}`).catch(() => {});
            this.playNext();
        });

        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(this.connection, VoiceConnectionStatus.Signalling, 5000),
                    entersState(this.connection, VoiceConnectionStatus.Connecting, 5000),
                ]);
            } catch {
                this.destroy();
            }
        });
    }

    enqueue(track) {
        this.tracks.push(track);
    }

    async playNext() {
        if (this.tracks.length === 0) {
            this.current = null;
            this.playing = false;
            this.textChannel.send('Queue finished.').catch(() => {});
            return;
        }

        const track = this.tracks.shift();
        this.current = track;
        this.playing = true;

        try {
            const audioStream = ytdlp.stream(track.url);
            const resource = createAudioResource(audioStream);
            this.player.play(resource);
            this.textChannel.send(`Now playing: **${track.title}** by **${track.author}**`).catch(() => {});
        } catch (error) {
            console.error('Play error:', error.message);
            this.textChannel.send(`Failed to play **${track.title}**.`).catch(() => {});
            this.playNext();
        }
    }

    skip() {
        this.player.stop();
    }

    pause() {
        return this.player.pause();
    }

    resume() {
        return this.player.unpause();
    }

    destroy() {
        this.tracks = [];
        this.current = null;
        this.playing = false;
        this.player.stop(true);
        this.connection.destroy();
        queues.delete(this.guildId);
    }
}

function getQueue(guildId) {
    return queues.get(guildId) || null;
}

function createQueue(guildId, voiceChannel, textChannel) {
    let queue = queues.get(guildId);
    if (queue) {
        queue.textChannel = textChannel;
        return queue;
    }
    queue = new GuildQueue(guildId, voiceChannel, textChannel);
    queues.set(guildId, queue);
    return queue;
}

async function search(query) {
    // Try YouTube first
    try {
        return await ytdlp.searchYouTube(query);
    } catch {
        // YouTube failed — try Spotify search + SoundCloud audio
    }

    try {
        const spotifyResult = await spotify.search(query);
        if (spotifyResult) {
            const scResult = await ytdlp.searchSoundCloud(spotifyResult.searchQuery);
            return {
                ...scResult,
                title: spotifyResult.title,
                author: spotifyResult.author,
                thumbnail: spotifyResult.thumbnail || scResult.thumbnail,
                source: 'spotify',
            };
        }
    } catch {
        // Spotify+SoundCloud failed — try plain SoundCloud
    }

    return await ytdlp.searchSoundCloud(query);
}

module.exports = { getQueue, createQueue, search };

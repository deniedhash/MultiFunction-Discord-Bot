const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    StreamType,
} = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');
const ytdlp = require('./ytdlp');
const spotify = require('./spotify');
const { getVolume } = require('./guildSettingsModel');

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return 'Unknown';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

const sourceLabel = {
    youtube: 'YouTube',
    soundcloud: 'SoundCloud',
    spotify: 'Spotify',
};

const queues = new Map();

class GuildQueue {
    constructor(guildId, voiceChannel, textChannel) {
        this.guildId = guildId;
        this.textChannel = textChannel;
        this.tracks = [];
        this.current = null;
        this.playing = false;
        this.volume = 1.0;
        this.resource = null;
        this.loopMode = 'off'; // 'off' | 'track' | 'queue'
        this.seeking = false;

        this.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guildId,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        this.player = createAudioPlayer();
        this.connection.subscribe(this.player);
        this.idleTimer = null;

        this.player.on(AudioPlayerStatus.Idle, () => {
            if (this.seeking) return;
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
        this.clearIdleTimer();
        this.tracks.push(track);
    }

    startIdleTimer() {
        this.clearIdleTimer();
        this.idleTimer = setTimeout(() => {
            this.textChannel.send('Disconnecting due to inactivity.').catch(() => {});
            this.destroy();
        }, 10 * 60 * 1000);
    }

    clearIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }

    async playNext() {
        // Track loop: replay current track
        if (this.loopMode === 'track' && this.current) {
            this.clearIdleTimer();
            try {
                const audioStream = ytdlp.stream(this.current.url);
                const resource = createAudioResource(audioStream, {
                    inputType: StreamType.Arbitrary,
                    inlineVolume: true,
                });
                resource.volume.setVolume(this.volume);
                this.resource = resource;
                this.player.play(resource);
                return;
            } catch (error) {
                console.error('Loop replay error:', error.message);
                this.textChannel.send(`Failed to replay **${this.current.title}**.`).catch(() => {});
            }
        }

        // Queue loop: push finished track back to end
        if (this.loopMode === 'queue' && this.current) {
            this.tracks.push(this.current);
        }

        if (this.tracks.length === 0) {
            this.current = null;
            this.playing = false;
            this.resource = null;
            this.textChannel.send('Queue finished.').catch(() => {});
            this.startIdleTimer();
            return;
        }

        this.clearIdleTimer();
        const track = this.tracks.shift();
        this.current = track;
        this.playing = true;

        try {
            const audioStream = ytdlp.stream(track.url);
            const resource = createAudioResource(audioStream, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true,
            });
            resource.volume.setVolume(this.volume);
            this.resource = resource;
            this.player.play(resource);
            const npTitle = track.url ? `[${track.title}](${track.url})` : track.title;
            const npEmbed = new EmbedBuilder()
                .setTitle('Now Playing')
                .setDescription(npTitle)
                .setThumbnail(track.thumbnail || null)
                .setColor(0x5865f2)
                .addFields(
                    { name: 'Author', value: track.author || 'Unknown', inline: true },
                    { name: 'Duration', value: formatDuration(track.duration), inline: true },
                    { name: 'Source', value: sourceLabel[track.source] || track.source || 'Unknown', inline: true },
                );
            this.textChannel.send({ embeds: [npEmbed] }).catch(() => {});
        } catch (error) {
            console.error('Play error:', error.message);
            this.textChannel.send(`Failed to play **${track.title}**.`).catch(() => {});
            this.playNext();
        }
    }

    setVolume(vol) {
        this.volume = vol;
        if (this.resource && this.resource.volume) {
            this.resource.volume.setVolume(vol);
        }
    }

    setLoop(mode) {
        this.loopMode = mode;
    }

    shuffle() {
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
    }

    async seek(seconds) {
        if (!this.current) return;
        this.seeking = true;
        this.player.stop();

        try {
            const audioStream = ytdlp.streamFrom(this.current.url, seconds);
            const resource = createAudioResource(audioStream, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true,
            });
            resource.volume.setVolume(this.volume);
            this.resource = resource;
            this.player.play(resource);
        } catch (error) {
            console.error('Seek error:', error.message);
            this.textChannel.send(`Failed to seek: ${error.message}`).catch(() => {});
        } finally {
            this.seeking = false;
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
        this.clearIdleTimer();
        this.tracks = [];
        this.current = null;
        this.playing = false;
        this.resource = null;
        this.player.stop(true);
        this.connection.destroy();
        queues.delete(this.guildId);
    }
}

function getQueue(guildId) {
    return queues.get(guildId) || null;
}

async function createQueue(guildId, voiceChannel, textChannel) {
    let queue = queues.get(guildId);
    if (queue) {
        queue.textChannel = textChannel;
        return queue;
    }
    queue = new GuildQueue(guildId, voiceChannel, textChannel);
    try {
        queue.volume = await getVolume(guildId);
    } catch (err) {
        console.error('Failed to load saved volume, using default:', err.message);
    }
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

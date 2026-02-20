const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execFileAsync = promisify(execFile);

const cookiesPath = path.join(__dirname, '..', '..', 'cookies.txt');
const hasCookies = fs.existsSync(cookiesPath);

function buildArgs(baseArgs) {
    if (hasCookies) baseArgs.push('--cookies', cookiesPath);
    return baseArgs;
}

// Prefer android client for YouTube — provides direct https URLs instead of m3u8/HLS
// which avoids 403 fragment errors from YouTube's anti-bot on HLS streams
// Use android client for YouTube — provides direct https URLs instead of m3u8/HLS
// which avoids 403 fragment errors from YouTube's anti-bot on HLS streams
const YT_EXTRACTOR_ARGS = ['--extractor-args', 'youtube:player_client=android'];

async function searchYouTube(query) {
    const args = buildArgs([
        `ytsearch:${query}`,
        '--dump-json',
        '--no-download',
        '--no-warnings',
        '--default-search', 'ytsearch',
        ...YT_EXTRACTOR_ARGS,
    ]);

    const { stdout } = await execFileAsync('yt-dlp', args, { timeout: 15000 });
    const info = JSON.parse(stdout);

    return {
        title: info.title,
        author: info.uploader || info.channel || 'Unknown',
        url: info.webpage_url || info.url,
        duration: info.duration,
        thumbnail: info.thumbnail,
        source: 'youtube',
    };
}

async function searchSoundCloud(query) {
    const args = buildArgs([
        `scsearch:${query}`,
        '--dump-json',
        '--no-download',
        '--no-warnings',
    ]);

    const { stdout } = await execFileAsync('yt-dlp', args, { timeout: 15000 });
    const info = JSON.parse(stdout);

    return {
        title: info.title,
        author: info.uploader || info.channel || 'Unknown',
        url: info.webpage_url || info.url,
        duration: info.duration,
        thumbnail: info.thumbnail,
        source: 'soundcloud',
    };
}

async function search(query) {
    try {
        return await searchYouTube(query);
    } catch {
        return await searchSoundCloud(query);
    }
}

function spawnYtdlp(extraArgs) {
    const proc = spawn('yt-dlp', extraArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stderr.on('data', (data) => {
        console.error(`[yt-dlp stderr] ${data.toString().trim()}`);
    });

    proc.on('exit', (code) => {
        if (code && code !== 0) {
            console.error(`[yt-dlp] exited with code ${code}`);
        }
    });

    return proc.stdout;
}

function stream(url) {
    const args = buildArgs([
        '-f', 'bestaudio/best',
        '-o', '-',
        '--no-warnings',
        ...YT_EXTRACTOR_ARGS,
        url,
    ]);

    return spawnYtdlp(args);
}

function streamFrom(url, seconds) {
    const args = buildArgs([
        '-f', 'bestaudio/best',
        '-o', '-',
        '--no-warnings',
        ...YT_EXTRACTOR_ARGS,
        '--download-sections', `*${seconds}-`,
        url,
    ]);

    return spawnYtdlp(args);
}

module.exports = { search, searchYouTube, searchSoundCloud, stream, streamFrom };

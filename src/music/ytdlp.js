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

async function searchYouTube(query) {
    const args = buildArgs([
        `ytsearch:${query}`,
        '--dump-json',
        '--no-download',
        '--no-warnings',
        '--default-search', 'ytsearch',
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

function stream(url) {
    const args = buildArgs([
        '-f', 'bestaudio',
        '-o', '-',
        '--no-warnings',
        '--quiet',
        url,
    ]);

    const process = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    return process.stdout;
}

module.exports = { search, searchYouTube, searchSoundCloud, stream };

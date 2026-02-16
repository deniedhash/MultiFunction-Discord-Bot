const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

async function search(query) {
    const { stdout } = await execFileAsync('yt-dlp', [
        `ytsearch:${query}`,
        '--dump-json',
        '--no-download',
        '--no-warnings',
        '--default-search', 'ytsearch',
    ], { timeout: 15000 });

    const info = JSON.parse(stdout);
    return {
        title: info.title,
        author: info.uploader || info.channel || 'Unknown',
        url: info.webpage_url || info.url,
        duration: info.duration,
        thumbnail: info.thumbnail,
    };
}

function stream(url) {
    const process = spawn('yt-dlp', [
        '-f', 'bestaudio',
        '-o', '-',
        '--no-warnings',
        '--quiet',
        url,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    return process.stdout;
}

module.exports = { search, stream };

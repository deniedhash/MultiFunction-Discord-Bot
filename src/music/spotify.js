const { spotifyClientId, spotifyClientSecret } = require('../../config');

let accessToken = null;
let tokenExpiry = 0;

async function getToken() {
    if (accessToken && Date.now() < tokenExpiry) return accessToken;

    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${spotifyClientId}:${spotifyClientSecret}`).toString('base64'),
        },
        body: 'grant_type=client_credentials',
    });

    if (!res.ok) throw new Error('Failed to get Spotify token');

    const data = await res.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return accessToken;
}

async function search(query) {
    if (!spotifyClientId || !spotifyClientSecret) return null;

    const token = await getToken();
    const res = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
        { headers: { 'Authorization': `Bearer ${token}` } },
    );

    if (!res.ok) return null;

    const data = await res.json();
    const track = data.tracks?.items?.[0];
    if (!track) return null;

    return {
        title: track.name,
        author: track.artists.map(a => a.name).join(', '),
        duration: Math.floor(track.duration_ms / 1000),
        thumbnail: track.album.images[0]?.url || null,
        searchQuery: `${track.name} ${track.artists[0]?.name || ''}`,
    };
}

module.exports = { search };

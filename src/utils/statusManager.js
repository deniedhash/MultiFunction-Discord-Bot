// src/utils/statusManager.js

const { ActivityType } = require("discord.js");
const os = require("os");

class StatusManager {
  constructor(client, options = {}) {
    this.client = client;
    this.interval = options.interval || 20000;
    this.index = 0;
    this.timer = null;

    this.previousCpuInfo = this.getCpuInfo();
  }

  async getServerCount() {
    if (this.client.shard) {
      const shardGuildCounts =
        await this.client.shard.fetchClientValues("guilds.cache.size");
      return shardGuildCounts.reduce((acc, count) => acc + count, 0);
    }

    return this.client.guilds.cache.size;
  }

  formatUptime() {
    const totalSeconds = Math.floor(process.uptime());

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  formatSystemMemory() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    const usedMB = Math.round(used / 1024 / 1024);
    const totalMB = Math.round(total / 1024 / 1024);

    return `${usedMB}MB / ${totalMB}MB`;
  }

  getCpuInfo() {
    const cpus = os.cpus();

    let idle = 0;
    let total = 0;

    cpus.forEach((core) => {
      for (let type in core.times) {
        total += core.times[type];
      }
      idle += core.times.idle;
    });

    return { idle, total };
  }

  calculateCpuUsage() {
    const current = this.getCpuInfo();

    const idleDiff = current.idle - this.previousCpuInfo.idle;
    const totalDiff = current.total - this.previousCpuInfo.total;

    this.previousCpuInfo = current;

    const usage = 100 - Math.round((idleDiff / totalDiff) * 100);
    return usage;
  }

  async getStatuses() {
    const serverCount = await this.getServerCount();
    const uptime = this.formatUptime();
    const memory = this.formatSystemMemory();
    const cpu = this.calculateCpuUsage();

    return [
      {
        name: `Serving ${serverCount} servers`,
        type: ActivityType.Watching,
      },
      {
        name: `Uptime: ${uptime}`,
        type: ActivityType.Competing,
      },
      {
        name: `RAM: ${memory}`,
        type: ActivityType.Streaming,
      },
      {
        name: `CPU: ${cpu}%`,
        type: ActivityType.Watching,
      },
      {
        name: `Use !setrepo to sync`,
        type: ActivityType.Playing,
      },
    ];
  }

  async update() {
    try {
      const statuses = await this.getStatuses();
      const status = statuses[this.index];

      this.client.user.setPresence({
        activities: [{ name: status.name, type: status.type }],
        status: "online",
      });

      this.index = (this.index + 1) % statuses.length;
    } catch (err) {
      console.error("Status update error:", err);
    }
  }

  start() {
    if (this.timer) return;

    this.update();

    this.timer = setInterval(() => {
      this.update();
    }, this.interval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = StatusManager;

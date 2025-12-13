const { EmbedBuilder } = require('discord.js')
const emojis = require("../../config/emojis.json")
const config = require('../../config/league.js')

function safe(v) {
  return (v === undefined || v === null || String(v) === "") ? "\u200B" : String(v)
}

async function getUserStatsEmbed({ client, user, data, isFreeAgent = false }) {
  const discordUser = await client.users.fetch(user.discordId).catch(() => null)

  // --- Stats de liga ---
  const matchesWon = Number(user.leagueStats?.matchesWon || 0)
  const matchesLost = Number(user.leagueStats?.matchesLost || 0)
  const matchesPlayed = matchesWon + matchesLost
  const matchesWinrate = (matchesPlayed > 0 ? ((matchesWon / matchesPlayed) * 100) : 0).toFixed(0)
  const matchesLoserate = (matchesPlayed > 0 ? ((matchesLost / matchesPlayed) * 100) : 0).toFixed(0)
  const matchStarPlayer = Number(user.leagueStats?.matchStarPlayer || 0)

  const setsWon = Number(user.leagueStats?.setsWon || 0)
  const setsLost = Number(user.leagueStats?.setsLost || 0)
  const setsPlayed = setsWon + setsLost
  const setsWinrate = (setsPlayed > 0 ? ((setsWon / setsPlayed) * 100) : 0).toFixed(0)
  const setsLoserate = (setsPlayed > 0 ? ((setsLost / setsPlayed) * 100) : 0).toFixed(0)
  const setStarPlayer = Number(user.leagueStats?.setStarPlayer || 0)

  const leaguesWon = Number(user.leagueStats?.leaguesWon || 0)

  // --- Color seguro ---
  const rawColor = String(data?.nameColor || "")
  const hex = rawColor.replace(/^#|0x/, "")
  const color = (/^[0-9A-Fa-f]{6}$/.test(hex) ? parseInt(hex, 16) : 3447003)

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `${data?.name || "Jugador"} (${data?.tag || "?"})`,
      iconURL: `https://github.com/Brawlify/CDN/blob/master/profile-icons/regular/${data?.icon?.id || "28000047"}.png`
    })
    .setThumbnail(discordUser?.avatarURL?.() || `https://cdn.brawlify.com/icon/${data?.icon?.id || "28000047"}.png`)


  const freeAgentText = isFreeAgent
    ? ` — Agente Libre\n> Usa el botón **Buscar Equipo** de <#${config.channels.register.id}> para activar o desactivar el estado de agente libre.`
    : ""
  embed.setDescription(`### <@${user.discordId}>${freeAgentText}`.trim() || "\u200B")

  // --- Campos: Liga ---
  embed.addFields(
    { name: "Partidos Jugados", value: safe(`${emojis?.match || ""} \`${matchesPlayed}\` ${emojis.starPlayer} \`${matchStarPlayer}\``), inline: true },
    { name: "Partidos Ganados", value: safe(`${emojis.match} \`${matchesWon}\` \`(${matchesWinrate}%)\``), inline: true },
    { name: "Partidos Perdidos", value: safe(`${emojis.match} \`${matchesLost}\` \`(${matchesLoserate}%)\``), inline: true },
    { name: "Sets Jugados", value: safe(`${emojis?.match || ""} \`${setsPlayed}\` ${emojis.starPlayer} \`${setStarPlayer}\``), inline: true },
    { name: "Sets Ganados", value: safe(`${emojis.match} \`${setsWon}\` \`(${setsWinrate}%)\``), inline: true },
    { name: "Sets Perdidos", value: safe(`${emojis.match} \`${setsLost}\` \`(${setsLoserate}%)\``), inline: true },
    { name: "Ligas Ganadas", value: safe(`${emojis.league} \`${leaguesWon}\``), inline: true },
    // { name: "\u200B", value: "\u200B", inline: true },
    // { name: "\u200B", value: "\u200B", inline: true }
  )

  // --- Campos: Brawl ---
  embed.addFields(
    { name: "Trofeos", value: safe(`${emojis.trophies} \`${data?.trophies || "No disponible"}\``), inline: true },
    { name: "Trofeos Máximos", value: safe(`${emojis.highestTrophies} \`${data?.highestTrophies || "No disponible"}\``), inline: true },
    { name: "Victorias 3vs3", value: safe(`${emojis.wins3vs3} \`${data?.["3vs3Victories"] || 0}\``), inline: true },
    { name: "Nivel de XP", value: safe(`${emojis.XPLevel} \`${data?.expLevel || "No disponible"}\``), inline: true },
    { name: "Club", value: safe(`${emojis.club} ${data?.club?.name || "Sin club"}`), inline: true },
    // { name: "\u200B", value: "\u200B", inline: true }
  )

  if (isFreeAgent) embed.setTimestamp()

  return embed
}

module.exports = { getUserStatsEmbed }

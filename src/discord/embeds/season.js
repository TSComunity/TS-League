const { EmbedBuilder } = require('discord.js')
const emojis = require('../../config/emojis.json')
const { getCurrentRoundNumber } = require('../../utils/round.js')

const getSeasonStartedEmbed = ({ season }) => {
const { name, seasonIndex, divisions, startDate } = season

// Contar total de equipos
const totalTeams = divisions.reduce((acc, d) => acc + d.teams.length, 0)

// Construir descripción formal y por párrafos
const description = 
`## Temporada ${name} — Edición ${seasonIndex} Comenzada\n` +
`La temporada ha comenzado con **${totalTeams}** equipos registrados.\n\n` +
`### Divisiones participantes:\n` +
`${divisions.map(d => `> ${d.divisionId.emoji} ${d.divisionId.name}`).join('\n')}`

return new EmbedBuilder()
    .setColor('Green')
    .setDescription(description)
    .setThumbnail('attachment://tsLeague.webp');
}


const getSeasonEndedEmbed = ({ season }) => {
    const { name, seasonIndex, divisions, startDate, endDate } = season

    let totalRounds = 0
    let totalMatches = 0
    let totalTeams = 0

    for (const division of divisions) {
        totalTeams += division.teams.length
        totalRounds += division.rounds.length
        for (const round of division.rounds) {
            totalMatches += round.matches.length
        }
    }

    const durationDays = startDate && endDate
        ? Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
        : null

    return new EmbedBuilder()
        .setColor('Blue')
        .setThumbnail('attachment://tsLeague.webp')
        .setDescription(`## ${emojis.season} Temporada ${name} — Edición ${seasonIndex} Finalizada`)
        .addFields(
            { name: `Jornadas`, value: `${emojis.round} \`${totalRounds}\``, inline: true },
            { name: `Divisiones`, value: `${emojis.division} \`${divisions.length}\``, inline: true },
            { name: `Equipos`, value: `${emojis.team} \`${totalTeams}\``, inline: true },
            { name: `Partidos`, value: `${emojis.match} \`${totalMatches}\``, inline: true },
            { name: `Inicio`, value: `${emojis.schedule} <t:${Math.floor(new Date(startDate).getTime() / 1000)}:D>`, inline: true },
            { name: `Duración`, value: durationDays ? `${emojis.schedule}\`${durationDays} días\`` : '`-`', inline: true }
        )
}

const getSeasonSummaryEmbed = ({ season }) => {
    const { seasonIndex, name, status, divisions, startDate } = season

    const roundNumber = getCurrentRoundNumber({ season })
    let totalTeams = 0
    let totalMatches = 0
    let totalRounds = 0

    for (const division of divisions) {
        totalTeams += division.teams.length
        totalRounds += division.rounds.length
        for (const round of division.rounds) {
            totalMatches += round.matches.length
        }
    }

    // Si está activa, usamos fecha actual para duración
    const durationDays = Math.ceil(((status === 'active' ? Date.now() : season.endDate) - startDate) / (1000 * 60 * 60 * 24))

    return new EmbedBuilder()
        .setColor('Purple')
        .setDescription(`## ${emojis.season} Temporada ${name} — Edición ${seasonIndex}`)
        .addFields(
            { 
                name: `Estado`, 
                value: status === 'active' 
                    ? `${emojis.active} En curso` 
                    : `${emojis.ended} Finalizada`, 
                inline: true 
            },
            { 
                name: status === 'active' ? `Jornada Actual` : `Jornadas Totales`, 
                value: `${emojis.round} \`${roundNumber}\``, 
                inline: true 
            },
            { name: `Divisiones`, value: `${emojis.division} \`${divisions.length}\``, inline: true },
            { name: `Equipos`, value: `${emojis.team} \`${totalTeams}\``, inline: true },
            { name: `Partidos`, value: `${emojis.match} \`${totalMatches}\``, inline: true },
            { name: `Duración`, value: `${emojis.schedule} ${durationDays} ${durationDays === 1 ? 'día' : 'días'}`, inline: true }
        )
}

module.exports = { getSeasonStartedEmbed, getSeasonEndedEmbed, getSeasonSummaryEmbed }
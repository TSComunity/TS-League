const { EmbedBuilder } = require('discord.js')
const emojis = require('../../config/emojis.json')
const gameModes = require('../../config/gameModes.json')

const getRoundAddedEmbed = ({ divisionsWithNewRounds, season, nextRoundIndex }) => {
    const { name, seasonIndex } = season

    let matchesLength = 0
    let restingLength = 0
    for (const division of divisionsWithNewRounds) {
        matchesLength += (division.newMatchesDocs?.length || 0)
        restingLength += (division.newRestingTeamsDocs?.length || 0)
    }
function generateSetsFields(sets, gameModes) {
    if (!sets || sets.length === 0) return []
    let index = 0
    return sets.map(set => {
        index++
        const mode = gameModes.find(m => m.id.toLowerCase() === set.mode.toLowerCase())

        const modeEmoji = mode ? mode.emoji : '🎮'

        const mapName = mode?.maps.find(mp => 
            mp.id.toLowerCase() === set.map.toLowerCase() || 
            mp.name.toLowerCase() === set.map.toLowerCase()
        )?.name || set.map

        return {
            name: `Set ${index}`,
            value: `${modeEmoji} ${mapName}`,
            inline: true
        }
    })
}

const setsFields = generateSetsFields(divisionsWithNewRounds[0].newMatchesDocs[0].sets, gameModes)

const embed = new EmbedBuilder()
    .setColor('Gold')
    .setDescription(`## ${emojis.round} Jornada ${nextRoundIndex} — Temporada ${name} (Edición ${seasonIndex})`)
    .addFields(
        { name: `Nuevos partidos`, value: `${emojis.match} \`${matchesLength}\``, inline: true },
        { name: `Nuevos descansos`, value: `${emojis.rest} \`${restingLength}\``, inline: true },
        { name: '\u200B', value: '\u200B', inline: true }, // otro separador
        ...setsFields // añadimos un field por cada modo
    )

return embed
}


module.exports = { getRoundAddedEmbed }
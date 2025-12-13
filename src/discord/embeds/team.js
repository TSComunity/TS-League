const { EmbedBuilder } = require('discord.js')
const config  = require('../../config/league.js')
const emojis = require('../../config/emojis.json')

const getTeamInfoEmbed = ({ team, perms }) => {

    const rolePriority = { 'leader': 0, 'sub-leader': 1, 'member': 2 }
      const sortedMembers = [...team.members].sort((a, b) => {
        return rolePriority[a.role] - rolePriority[b.role]
      })

      const formattedList = sortedMembers.map(m => {
        const userId = m.userId.discordId || m.userId // por si acaso no está poblado
        const roleLabel = m.role === 'leader' ? emojis.leader :
                          m.role === 'sub-leader' ? emojis.subLeader :
                          emojis.member
        return `${roleLabel} <@${userId}>`
      }).join('\n')


    let formattedDivision = ''
    if (team.divisionId) {
        formattedDivision = `${team.divisionId.emoji || emojis.division} ${team.divisionId.name || 'División sin nombre'}`
    } else {
        formattedDivision = `${emojis.division} En ninguna división`
    }

    const embed = new EmbedBuilder()
        .setColor(team.color || 'Blue')
        .setThumbnail(team.iconURL)
        .setDescription(`## ${team.name}`)
        .setThumbnail(team.iconURL)
        .addFields(
            { name: `Miembros — ${team.members.length}/${config.team.maxMembers}`, value: formattedList, inline: true },
            { name: `División`, value: formattedDivision, inline: true },
            ...(perms ? [{ name: `Código`, value: `${emojis.code} \`${team.code}\``, inline: true }] : [])
        )
    
    return embed
}

const getAddMemberInfoEmbed = ({ teamCode }) => {
    return (
        new EmbedBuilder()
            .setColor('Blue')
            .setDescription(`
    ## ${emojis.teamAddMember} Añadir miembros
    Los nuevos miembros solo podrán unirse a tu equipo utilizando el **código del equipo**, el cual es accesible únicamente para líderes y sub-líderes. Este código nunca debe compartirse en canales públicos, ya que permitiría la entrada de cualquier persona sin control. Siempre que se genere un nuevo código, el anterior quedará automáticamente invalidado, garantizando la seguridad y privacidad del equipo. El código actual de tu equipo es: \`${teamCode}\`. Compártelo únicamente con los jugadores que quieras invitar a tu equipo.

    Si tu equipo busca nuevos jugadores, también puedes usar el canal de <#${config.channels.freeAgents.id}>. Allí, cada usuario que busque equipo contará con un mensaje con información actualizada de sus estadísticas de Brawl Stars. Esto te permitirá revisar perfiles y contactar fácilmente con los jugadores que más se adapten a lo que tu equipo necesita.
            `)
            .setFooter({ text: 'Utiliza el botón inferior para regenerar el código si fuera necesario.' })
    )
}

const getTeamsSummaryEmbed = ({ divisionsCount, teamsInDivisionsCount, teamsCount }) => {

    return (
        new EmbedBuilder()
            .setColor('Purple')
            .setDescription(`## ${emojis.division} Divisiones`)
            .addFields(
                { name: `${emojis.division} Divisiones`, value: `\`${divisionsCount}\``, inline: true },
                { name: `${emojis.teamsInDivisions} Equipos en divisiones`, value: `\`${teamsInDivisionsCount}\``, inline: true },
                { name: `${emojis.team} Equipos totales`, value: `\`${teamsCount}\``, inline: true }
            )
    )
}

const getTeamStatsEmbed = ({ team }) => {
    const matchesPlayed = team.stats.matchesWon + team.stats.matchesLost
    const matchesWinrate = (matchesPlayed > 0
    ? ((team.stats.matchesWon / matchesPlayed) * 100)
    : 0).toFixed(0)
    const matchesLoserate = (matchesPlayed > 0
    ? ((team.stats.matchesLost / matchesPlayed) * 100)
    : 0).toFixed(0)

    const setsPlayed = team.stats.setsWon + team.stats.setsLost
    const setsWinrate = (setsPlayed > 0
    ? ((team.stats.setsWon / setsPlayed) * 100)
    : 0).toFixed(0)
    const setsLoserate = (setsPlayed > 0
    ? ((team.stats.setsLost / setsPlayed) * 100)
    : 0).toFixed(0)

  return new EmbedBuilder()
    .setColor(team.color || 'Blue')
    .setThumbnail(team.iconURL || '')
    .setDescription(`## ${emojis.team} ${team.name}`)
    .addFields(

      { name: "Partidos Jugados", value: `${emojis.match} \`${matchesPlayed}\``, inline: true },
      { name: "Partidos Ganados", value: `${emojis.match} \`${team.stats.matchesWon}\` \`(${matchesWinrate}%)\``, inline: true },
      { name: "Partidos Perdidos", value: `${emojis.match} \`${team.stats.matchesLost}\` \`(${matchesLoserate}%)\``, inline: true },

      { name: "Sets Jugados", value: `${emojis.match} \`${setsPlayed}\``, inline: true },
      { name: "Sets Ganados", value: `${emojis.match} \`${team.stats.setsWon}\` \`(${setsWinrate}%)\``, inline: true },
      { name: "Sets Perdidos", value: `${emojis.match} \`${team.stats.setsLost}\` \`(${setsLoserate}%)\``, inline: true },

      { name: 'Ligas Ganadas', value: `${emojis.league} \`${team.stats.leaguesWon}\``, inline: true}
    )
}

const getTeamChannelCreatedEmbed = ({ team }) => {
  return new EmbedBuilder()
    .setDescription(
      `### ${emojis.team} Canal del equipo **${team.name}**\n\n` +
      `Bienvenidos al canal exclusivo de vuestro equipo. Aquí recibiréis:` +
      `\n- Actualizaciones importantes de la liga` +
      `\n- Información actualizada de vuestros partidos` +
      `\n- Avisos y comunicaciones oficiales de la división` +
      `\n\nPor favor, revisad los mensajes regularmente para manteneros al día.`
    )
    .setColor(team.color || 'Blue')
    .setThumbnail(team.iconURL || '')
}


module.exports = { getTeamInfoEmbed, getAddMemberInfoEmbed, getTeamsSummaryEmbed, getTeamStatsEmbed, getTeamChannelCreatedEmbed }

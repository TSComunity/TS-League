const { EmbedBuilder } = require("discord.js")
const config = require("../../config/league.js")

async function sendTeamAnnouncement({ client, team, content = 'No se ha recibido ningun contenido.' }) {
  if (!team.channelId) return

  try {
    const channel = await client.channels.fetch(team.channelId)
    if (!channel) return

    const embed = new EmbedBuilder()
      .setDescription(content)
      .setColor(team.color || 'Blue')
      .setThumbnail(team.iconURL)

    await channel.send({
      content: `<@&${config.roles.ping.id}>`,
      embeds: [embed],
    })

  } catch (error) {
    if (error.code === 10003) {
      team.channelId = null
      await team.save()
    }
  }
}

module.exports = { sendTeamAnnouncement }
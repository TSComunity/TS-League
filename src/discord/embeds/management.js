const { EmbedBuilder } = require('discord.js')
const emojis = require('../../config/emojis.json')

const getErrorEmbed = ({ error = 'No se recibieron detalles del error.' }) => {
  return (
    new EmbedBuilder()
      .setColor('Red')
      .setDescription(`### ${emojis.error} Se ha producido un error\n\n> ${error}`)
  )
}

const getSuccesEmbed = ({ message = 'La operación ha sido completada sin errores.', imageURL = null }) => {
  return (
    new EmbedBuilder()
      .setColor('Green')
      .setDescription(`### ${emojis.success} Operación completada\n\n> ${message}`)
      .setImage(imageURL)
  )
}

const getMaintenanceEmbed = ({ reason = 'No se recibio ningun motivo.' }) => {
      return (
        new EmbedBuilder()
            .setColor('Blue')
            .setDescription(`### Mantenimiento\n\n${reason}`)
      )
}

module.exports = { getErrorEmbed, getSuccesEmbed, getMaintenanceEmbed }
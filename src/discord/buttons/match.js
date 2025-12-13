const { ButtonBuilder, ButtonStyle } = require('discord.js')
const emojis = require('../../config/emojis.json')

const getMatchChangeScheduleButton = ({ matchIndex }) => {
    return (
        new ButtonBuilder()
          .setCustomId(`matchChangeSchedule:${matchIndex}`)
          .setLabel('Proponer Horario')
          .setEmoji(emojis.schedule)
          .setStyle(ButtonStyle.Primary)
    )
}

const getMatchAcceptScheduleButton = ({ matchIndex, leaderId }) => {
    return (
        new ButtonBuilder()
          .setCustomId(`matchAcceptSchedule:${matchIndex}:${leaderId}`)
          .setLabel('Aceptar')
          .setEmoji(emojis.accept)
          .setStyle(ButtonStyle.Success)
    )
}

const getMatchRejectScheduleButton = ({ matchIndex, leaderId }) => {
    return (
        new ButtonBuilder()
          .setCustomId(`matchRejectSchedule:${matchIndex}:${leaderId}`)
          .setLabel('Rechazar')
          .setEmoji(emojis.reject)
          .setStyle(ButtonStyle.Danger)
    )
}


const getMatchCancelInteractionButton = () => {
    return (
        new ButtonBuilder()
        .setCustomId('matchCancelInteraction') 
        .setLabel('Cancelar')
        .setEmoji(emojis.cancel)
        .setStyle(ButtonStyle.Danger)
    )
}

const getMatchShareRoom = () => {
    return (
        new ButtonBuilder()
        .setCustomId('matchShareRoom') 
        .setLabel('Compartir Sala')
        .setEmoji(emojis.code)
        .setStyle(ButtonStyle.Secondary)
    )
}

module.exports = { getMatchChangeScheduleButton, getMatchCancelInteractionButton, getMatchAcceptScheduleButton, getMatchRejectScheduleButton, getMatchShareRoom }
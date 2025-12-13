const { ButtonBuilder, ButtonStyle } = require('discord.js')
const emojis = require('../../config/emojis.json')

const getTeamCreateButton = () => {
    return new ButtonBuilder()
      .setCustomId('teamCreate')
      .setLabel('Crear Equipo')
      .setEmoji(emojis.teamCreate)
      .setStyle(ButtonStyle.Primary);
}

const getTeamShowButton = () => {
    return (
        new ButtonBuilder()
        .setCustomId('teamShow')
        .setLabel('Mostrar Equipo')
        .setEmoji(emojis.teamShow)
        .setStyle(ButtonStyle.Secondary)
    )
}

const getTeamJoinButton = () => {
    return new ButtonBuilder()
      .setCustomId('teamJoin')
      .setLabel('Unirse a Equipo')
      .setEmoji(emojis.teamJoin)
      .setStyle(ButtonStyle.Success)
}

const getTeamLookingFotButton = () => {
    return new ButtonBuilder()
      .setCustomId('teamLookingFor')
      .setLabel('Buscar Equipo (Agente Libre)')
      .setEmoji(emojis.teamLookingFor)
      .setStyle(ButtonStyle.Secondary)
}

const getTeamLeftButton = () => {
    return (
        new ButtonBuilder()
            .setCustomId('teamLeave')
            .setLabel('Salir del Equipo')
            .setStyle(ButtonStyle.Danger)
            .setEmoji(emojis.teamLeave)
    )
}

const getTeamChangeNameButton = () => {
    return (
        new ButtonBuilder()
            .setCustomId('teamChangeName')
            .setLabel('Cambiar Nombre')
            .setEmoji(emojis.teamChangeName)
            .setStyle(ButtonStyle.Secondary)
    )
}

const getTeamChangeIconButton = () => {
    return (
        new ButtonBuilder()
            .setCustomId('teamChangeIcon')
            .setLabel('Cambiar Icono')
            .setEmoji(emojis.teamChangeIcon)
            .setStyle(ButtonStyle.Secondary)
    )
}

const getTeamChangeColorButton = () => {
    return (
        new ButtonBuilder()
            .setCustomId('teamChangeColor')
            .setLabel('Cambiar Color')
            .setEmoji(emojis.teamChangeColor)
            .setStyle(ButtonStyle.Secondary)
    )
}

const getTeamManageMembersButton = () => {
    return (
        new ButtonBuilder()
        .setCustomId('teamManageMembers')
        .setLabel('Gestionar Jugadores')
        .setEmoji(emojis.teamManageMembers)
        .setStyle(ButtonStyle.Secondary)
    )
}

const getTeamReGenerateCodeButton = () => {
    return (
        new ButtonBuilder()
            .setCustomId('teamReGenerateCode')
            .setLabel('Regenerar Código')
            .setEmoji(emojis.teamReGenerateCode)
            .setStyle(ButtonStyle.Secondary)
    )
}

const getTeamAddMemberButton = () => {
    return (
        new ButtonBuilder()
            .setCustomId('teamAddMember')
            .setLabel('Añadir Miembros')
            .setEmoji(emojis.teamAddMember)
            .setStyle(ButtonStyle.Primary)
    )
}

const getTeamChangeMemberRoleButton = () => {
    return (
        new ButtonBuilder()
            .setCustomId('teamChangeMemberRole')
            .setLabel('Gestionar Roles')
            .setEmoji(emojis.teamChangeMemberRole)
            .setStyle(ButtonStyle.Secondary)
    )
}

const getTeamKickMemberButton = () => {
    return (
        new ButtonBuilder()
            .setCustomId('teamKickMember')
            .setLabel('Expulsar Miembros')
            .setEmoji(emojis.teamKickMember)
            .setStyle(ButtonStyle.Danger)
    )
}

const getTeamChangeMemberRoleToLeader = ({ discordId }) => {
    return (
        new ButtonBuilder()
          .setCustomId(`teamChangeMemberRoleTo_leader_${discordId}`)
          .setLabel('Cambiar a Líder')
          .setEmoji(emojis.leader)
          .setStyle(ButtonStyle.Danger)
    )
}

const getTeamChangeMemberRoleToSubLeader = ({ discordId }) => {
    return (
        new ButtonBuilder()
          .setCustomId(`teamChangeMemberRoleTo_sub-leader_${discordId}`)
          .setLabel('Cambiar a Sub-líder')
          .setEmoji(emojis.subLeader)
          .setStyle(ButtonStyle.Primary)
    )
}

const getTeamChangeMemberRoleToMember = ({ discordId }) => {
    return (
        new ButtonBuilder()
          .setCustomId(`teamChangeMemberRoleTo_member_${discordId}`)
          .setLabel('Cambiar a Miembro')
          .setEmoji(emojis.member)
          .setStyle(ButtonStyle.Secondary)
    )
}

const getTeamCancelButton = () => {
    return (
        new ButtonBuilder()
        .setCustomId('teamCancel')
        .setLabel('Cancelar')
        .setEmoji(emojis.cancel)
        .setStyle(ButtonStyle.Danger)
    )
}

const getTeamStatsButton = ({ teamName }) => {
    return (
        new ButtonBuilder()
        .setCustomId(`teamStatsButton-${teamName}`)
        .setLabel('Ver Estadísticas')
        .setStyle(ButtonStyle.Secondary)
    )
}

module.exports = {
    getTeamCreateButton,
    getTeamShowButton,
    getTeamJoinButton,
    getTeamLookingFotButton,
    getTeamLeftButton,
    getTeamChangeNameButton,
    getTeamChangeIconButton,
    getTeamChangeColorButton,
    getTeamManageMembersButton,
    getTeamReGenerateCodeButton,
    getTeamAddMemberButton,
    getTeamChangeMemberRoleButton,
    getTeamKickMemberButton,
    getTeamChangeMemberRoleToLeader,
    getTeamChangeMemberRoleToSubLeader,
    getTeamChangeMemberRoleToMember,
    getTeamCancelButton,
    getTeamStatsButton
}
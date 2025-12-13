const { SlashCommandBuilder } = require('discord.js')
const {
    updateTeamCode,
    createTeam,
    updateTeam,
    addTeamToDivision,
    removeTeamFromDivision,
    removeMemberFromTeam,
    changeMemberRole,
    addPointsToTeam,
    removePointsFromTeam
} = require('../../services/team.js')

const { findTeam } = require('../../utils/team.js')

const { getTeamInfoEmbed } = require('../../discord/embeds/team.js')
const { getErrorEmbed, getSuccesEmbed } = require('../../discord/embeds/management.js')
const { sendLog } = require('../../discord/send/staff.js')

const colors = require('../../config/colors.json')
const { commands } = require('../../config/league.js')
const ROLES_WITH_PERMS = commands.perms

module.exports = {
  data: new SlashCommandBuilder()
    .setName('equipo')
    .setDescription('Gestiona los equipos')

    // /equipo crear
    .addSubcommand(sub =>
      sub
        .setName('crear')
        .setDescription('Crea un nuevo equipo')
        .addStringOption(opt =>
          opt.setName('nombre').setDescription('Nombre del equipo').setRequired(true))
        .addAttachmentOption(opt =>
            opt.setName('icono').setDescription('Ícono del equipo').setRequired(true))
        .addStringOption(opt =>
          opt.setName('color').setDescription('Color del equipo').setRequired(true)
        .addChoices(...colors.map(color => ({
            name: `${color.emoji} ${color.label}`, // Mostramos emoji + nombre
            value: color.value
        })))))

    // /equipo actualizar
    .addSubcommand(sub =>
      sub
        .setName('actualizar')
        .setDescription('Actualiza un equipo')
        .addStringOption(opt =>
          opt.setName('nombre').setDescription('Nombre actual del equipo').setRequired(true))
        .addStringOption(opt =>
          opt.setName('nuevo-nombre').setDescription('Nuevo nombre del equipo').setRequired(false))
        .addAttachmentOption(opt =>
            opt.setName('nuevo-icono').setDescription('Ícono del equipo').setRequired(false))
        .addStringOption(opt =>
          opt.setName('nuevo-color').setDescription('Nuevo color').setRequired(false)
                  .addChoices(...colors.map(color => ({
            name: `${color.emoji} ${color.label}`, // Mostramos emoji + nombre
            value: color.value
        }))))
    )

    // /equipo asignar-division
    .addSubcommand(sub =>
      sub
        .setName('asignar-division')
        .setDescription('Asigna un equipo a una división')
        .addStringOption(opt =>
          opt.setName('nombre-equipo').setDescription('Nombre del equipo').setRequired(true))
        .addStringOption(opt =>
          opt.setName('nombre-division').setDescription('Nombre de la división').setRequired(true))
    )

    // /equipo eliminar-division
    .addSubcommand(sub =>
      sub
        .setName('desasignar-division')
        .setDescription('Elimina un equipo de su división')
        .addStringOption(opt =>
          opt.setName('nombre-equipo').setDescription('Nombre del equipo').setRequired(true))
    )

    // /equipo expulsar-miembro
    .addSubcommand(sub =>
      sub
        .setName('expulsar-miembro')
        .setDescription('Expulsa a un miembro del equipo')
        .addUserOption(opt =>
          opt.setName('usuario')
            .setDescription('El usuario')
            .setRequired(true)
        )
    )

    // /equipo cambiar-rol-miembro
    .addSubcommand(sub =>
      sub
        .setName('cambiar-rol-miembro')
        .setDescription('Cambia el rol de un miembro del equipo')
        .addUserOption(opt =>
          opt.setName('usuario')
            .setDescription('El usuario')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('nuevo-rol').setDescription('Nuevo rol').setRequired(true)
            .addChoices(
              { name: 'Líder', value: 'leader' },
              { name: 'Sub-líder', value: 'sub-leader' },
              { name: 'Miembro', value: 'member' }
            ))
    )

    // /equipo regenerar_codigo
    .addSubcommand(sub =>
      sub
        .setName('regenerar-codigo')
        .setDescription('Cambia el código de un equipo')
        .addStringOption(opt =>
          opt.setName('nombre-equipo').setDescription('Nombre del equipo').setRequired(true))
    )
    
    .addSubcommand(sub =>
      sub
        .setName('añadir-puntos')
        .setDescription('Añade puntos a un equipo')
        .addStringOption(opt =>
          opt.setName('nombre-equipo').setDescription('Nombre del equipo').setRequired(true))
        .addStringOption(opt =>
          opt.setName('puntos').setDescription('Puntos a añadir').setRequired(true)
            .addChoices(
              { name: '1', value: '1' },
              { name: '2', value: '2' },
              { name: '3', value: '3' },
              { name: '4', value: '4' },
              { name: '5', value: '5' }
            ))
    )
    
    .addSubcommand(sub =>
      sub
        .setName('remover-puntos')
        .setDescription('Remueve puntos de un equipo')
        .addStringOption(opt =>
          opt.setName('nombre-equipo').setDescription('Nombre del equipo').setRequired(true))
        .addStringOption(opt =>
          opt.setName('puntos').setDescription('Puntos a remover').setRequired(true)
            .addChoices(
              { name: '1', value: '1' },
              { name: '2', value: '2' },
              { name: '3', value: '3' },
              { name: '4', value: '4' },
              { name: '5', value: '5' }
            ))
    )

    .addSubcommand(sub =>
      sub
        .setName('ver')
        .setDescription('Ver los datos de un equipo')
        .addStringOption(opt =>
          opt.setName('nombre-equipo').setDescription('Nombre del equipo').setRequired(true))
        .addBooleanOption(opt =>
          opt.setName('mostrar-codigo').setDescription('Mostrar codigo del equipo (confidencial)').setRequired(false))
    ),

  async execute(interaction, client) {

    const member = interaction.member
    const hasPerms = member.roles.cache.some(role => ROLES_WITH_PERMS.includes(role.id))

    if (!hasPerms) {
        return interaction.reply({ embeds: [getErrorEmbed({ error: 'No tienes permisos para utilizar este comando.' })]})
    }

    const sub = interaction.options.getSubcommand()

    try {
      if (sub === 'crear') {
        const name = interaction.options.getString('nombre')
        const iconAttachment = interaction.options.getAttachment('icono')
        const iconURL = iconAttachment.url
        const color = interaction.options.getString('color')
        const presidentDiscordId = interaction.user.id
        const team = await createTeam({ name, iconURL, color, presidentDiscordId })
        await interaction.reply({
          embeds: [getSuccesEmbed({ message:`Equipo **${team.name}** creado.` })]
        })
        await sendLog({
          content: `El equipo **${team.name}** ha sido creado.\nColor: ${team.color}\nIcon URL: ${team.iconURL}`,
          client: interaction.client,
          type: 'success',
          userId: interaction.user.id,
          eventType: 'team'
        })

      } else if (sub === 'actualizar') {
        const teamName = interaction.options.getString('nombre')
        const name = interaction.options.getString('nuevo-nombre')
        const iconAttachment = interaction.options.getAttachment('nuevo-icono')
        const iconURL = iconAttachment?.url
        const color = interaction.options.getString('nuevo-color')
        const team = await updateTeam({ teamName, name, iconURL, color })
        await interaction.reply({
          embeds: [getSuccesEmbed({ message:`Equipo **${teamName}** actualizado.` })]
        })
        await sendLog({
          content: `El equipo **${teamName}** ha sido actualizado.\nNuevo nombre: ${name || 'Sin cambio'}\nNuevo color: ${color || 'Sin cambio'}\nNuevo icon URL: ${iconURL || 'Sin cambio'}`,
          client: interaction.client,
          type: 'warning',
          userId: interaction.user.id,
          eventType: 'team'
        })

      } else if (sub === 'asignar-division') {
        const teamName = interaction.options.getString('nombre-equipo')
        const divisionName = interaction.options.getString('nombre-division')
        const team = await addTeamToDivision({ client, teamName, divisionName })
        await interaction.reply({
          embeds: [getSuccesEmbed({ message:`Equipo **${teamName}** añadido a la división **${team.divisionId.name}**.` })]
        })
        await sendLog({
          content: `El equipo **${teamName}** ha sido añadido a la división **${divisionName}**.`,
          client: interaction.client,
          type: 'info',
          userId: interaction.user.id,
          eventType: 'division'
        })

      } else if (sub === 'desasignar-division') {
        const teamName = interaction.options.getString('nombre-equipo')
        await removeTeamFromDivision({ client, teamName })
        await interaction.reply({
          embeds: [getSuccesEmbed({ message:`Equipo **${teamName}** desasignado de su división.` })]
        })
        await sendLog({
          content: `El equipo **${teamName}** ha sido desasignado de su división.`,
          client: interaction.client,
          type: 'warning',
          userId: interaction.user.id,
          eventType: 'division'
        })

      } else if (sub === 'expulsar-miembro') {
        const user = interaction.options.getUser('usuario')
        const discordId = user.id
        const team = await removeMemberFromTeam({ client, discordId })
        await interaction.reply({
          embeds: [getSuccesEmbed({ message:`Miembro <@${discordId}> expulsado de **${team.name}**.` })]
        })
        await sendLog({
          content: `El usuario <@${discordId}> ha sido expulsado del equipo **${team.name}**.`,
          client: interaction.client,
          type: 'danger',
          userId: interaction.user.id,
          eventType: 'team'
        })

      } else if (sub === 'cambiar-rol-miembro') {
        const user = interaction.options.getUser('usuario')
        const discordId = user.id
        const newRole = interaction.options.getString('nuevo-rol')
        const team = await changeMemberRole({ discordId, newRole, client })
        let role = ''
        if (newRole === 'leader') role = 'líder'
        if (newRole === 'sub-leader') role = 'sub-líder'
        if (newRole === 'member') role = 'miembro'
        if (newRole !== 'leader' && newRole !== 'sub-leader' && newRole !== 'member') {
          throw new Error('No se ha proporcionado un rol valido.')
        }
        await interaction.reply({
          embeds: [getSuccesEmbed({ message:`Rol del usuario <@${discordId}> actualizado en el equipo **${team.name}** a \`${role}\`.` })]
        })
        await sendLog({
          content: `El usuario <@${discordId}> tiene ahora el rol de ${role} en el equipo **${team.name}**.`,
          client: interaction.client,
          type: 'info',
          userId: interaction.user.id,
          eventType: 'team'
        })

      } else if (sub === 'regenerar-codigo') {
        const teamName = interaction.options.getString('nombre-equipo')
        const team = await updateTeamCode({ teamName })
        await team.save()
        await interaction.reply({
          embeds: [getSuccesEmbed({ message:`Nuevo código generado para el equipo **${teamName}**: \`${team.code}\`` })],
          ephemeral: true
        })
      } else if (sub === 'añadir-puntos') {
        const teamName = interaction.options.getString('nombre-equipo')
        const points = interaction.options.getString('puntos')
        await addPointsToTeam({ teamName, points })
        await interaction.reply({
          embeds: [getSuccesEmbed({ message: `Se han añadido \`${points}\` puntos al equipo **${teamName}**.` })]
        })
        await sendLog({
          content: `Se han añadido ${points} puntos al equipo **${teamName}**.`,
          client: interaction.client,
          type: 'success',
          userId: interaction.user.id,
          eventType: 'points'
        })
      } else if (sub === 'remover-puntos') {
        const teamName = interaction.options.getString('nombre-equipo')
        const points = interaction.options.getString('puntos')
        await removePointsFromTeam({ teamName, points })
        await interaction.reply({
          embeds: [getSuccesEmbed({ message: `Se han removido \`${points}\` puntos del equipo **${teamName}**.` })]
        })
        await sendLog({
          content: `Se han removido ${points} puntos del equipo **${teamName}**.`,
          client: interaction.client,
          type: 'danger',
          userId: interaction.user.id,
          eventType: 'points'
        })
      } else if (sub === 'ver') {
        const teamName = interaction.options.getString('nombre-equipo')
        const perms = interaction.options.getBoolean('mostrar-codigo') || false
        const team = await findTeam({ teamName })
        const embed = getTeamInfoEmbed({ team, perms })
        await interaction.reply({ embeds: [embed] })
      }

    } catch (error) {
      console.error(error)
      await interaction.reply(
        {
          embeds: [getErrorEmbed({ error: error.message })]
        }
      )
    }
  }
}

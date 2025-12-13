const Division = require('../models/Division.js')
const Team = require('../models/Team.js')
const { division } = require('../config/league.js')

/**
 * Crea una nueva división si el nombre y el tier no están en uso.
 * @param {string} name - Nombre de la división.
 * @param {number} tier - Tier numérico (prioridad).
 * @returns {Object} newDivision - La división creada.
 */
const createDivision = async ({ name, tier, emoji, color, teamsCategoryId, matchesCategoryId }) => {
  if (!name || !tier || !emoji || !color || !teamsCategoryId || !matchesCategoryId) {
    throw new Error('Faltan datos: name, tier, emoji, color o categorías.')
  }

  const divisions = await Division.find()
  if (divisions.some(d => d.name === name)) throw new Error('Ya existe una división con ese nombre.')
  if (divisions.some(d => d.tier === tier)) throw new Error('Ya existe una división con ese tier.')

  const newDivision = new Division({ name, tier, emoji, color, teamsCategoryId, matchesCategoryId })
  await newDivision.save()
  return newDivision
}

/**
 * Elimina una división por su nombre.
 * @param {string} name - Nombre de la división.
 * @returns {Object} division - División eliminada.
 */
const deleteDivision = async ({ name }) => {
    if (!name) {
    throw new Error('Debes proporcionar un nombre.')
    }

    const division = await Division.findOne({ name })

    if (!division) {
    throw new Error('No se encontró la división.')
    }

    const teams = await Team.find({ divisionId: division._id })
    for (const team of teams) {
      team.divisionId = null
      await team.save()
    }

    await division.deleteOne()
    return division
}

/**
 * Actualiza una división existente por su nombre.
 * @param {string} name - Nombre actual de la división.
 * @param {string} newName - Nuevo nombre (opcional).
 * @param {number} newTier - Nuevo tier (opcional).
 * @returns {Object} division - División actualizada.
 */
const updateDivision = async ({ name, newName, newTier, newEmoji, newColor, newTeamsCategoryId, newMatchesCategoryId }) => {
  if (!name) throw new Error('Debes proporcionar un nombre.')

  const division = await Division.findOne({ name })
  if (!division) throw new Error('No se encontró la división.')

  if (newName) division.name = newName
  if (newTier) division.tier = newTier
  if (newEmoji) division.emoji = newEmoji
  if (newColor) division.color = newColor
  if (newTeamsCategoryId) division.teamsCategoryId = newTeamsCategoryId
  if (newMatchesCategoryId) division.matchesCategoryId = newMatchesCategoryId

  await division.save()
  return division
}

module.exports = { createDivision, deleteDivision, updateDivision }
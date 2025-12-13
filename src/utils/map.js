const gameModes = require('../config/gameModes.json')

/**
 * Devuelve información detallada de un mapa dado su ID
 * @param {string} mapId - id del mapa
 * @returns {Object} - objeto con informacion del mapa y su modo
 */

const getMapInfoById = (mapId) => {
  for (const mode of gameModes) {
    const map = mode.maps.find(m => m.id === mapId)
    if (map) {
      return {
        name: map.name,
        imageURL: map.imageURL,
        mode: mode.name
      }
    }
  }
  return null
}

module.exports = { getMapInfoById }
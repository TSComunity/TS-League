const { BRAWL_STARS_API_KEY } = require('../config/config.js')

function getUserBrawlData({ brawlId }) {
  return fetch(`https://api.brawlstars.com/v1/players/${encodeURIComponent(brawlId)}`, {
    headers: {
      Authorization: `Bearer ${BRAWL_STARS_API_KEY}`,
    },
  })
    .then(res => {
      if (!res.ok) {
        console.error("Error en la API:", res.status, res.statusText)
        return null
      }
      return res.json()
    })
    .catch(err => {
      console.error("Error en la API de Brawl Stars:", err)
      return null
    })
}

module.exports = { getUserBrawlData }
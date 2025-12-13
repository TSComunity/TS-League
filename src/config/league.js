function calcMaxRounds(maxTeams) {
  if (maxTeams < 2) return 0 // menos de 2 equipos no hay rondas

  if (maxTeams % 2 === 0) {
    // número par de equipos
    return maxTeams - 1;
  } else {
    // número impar de equipos, uno descansa cada ronda
    return maxTeams
  }
}

const maxTeams = 12

module.exports = {
  "guild": {
    "id": '1093864130030612521'
  },
  "categories": {
    "teams": {
      "withOutDivision": {
        "id": '1420050816076742676',
      }
    }
  },
  "channels": {
    "announcements": {
      "id": '1431372899855503421',
    },
    "logs": {
      "id": '1374691378604277760'
    },
    "results": {
      "id": '1431372343393128518'
    },
    "rankings": {
      "id": '1364999474564436068'
    },
    "divisions": {
      "id": '1375108833558397053'
    },
    "freeAgents": {
      "id": '1424456781673009213'
    },
    "register": {
      "id": '1393526853288853515'
    },
    "stage": {
      "id": '1437501083164475458'
    },
    "permissions": {
      "member": [
        "ViewChannel",
        "SendMessages",
        "SendTTSMessages",
        "SendVoiceMessages",
        "EmbedLinks",
        "AttachFiles",
        "ReadMessageHistory",
        "AddReactions",
        "UseExternalEmojis",
        "UseExternalStickers",
        "Connect",
        "Speak",
        "Stream",
        "UseApplicationCommands",
        "CreateInstantInvite"
      ],
      "leader": [
        "ManageMessages"
      ],
      "subLeader": [

      ],
      "staff": [
        "ManageMessages",
        "MentionEveryone"
      ]
    }
  },
  "roles": {
    "ping": {
      "id": '1393563891044450434'
    },
    "staff": [
      "1363927756617941154",
      "1202685031219200040",
      "1107329826982989906",
      "1107331844866846770"
    ]
  },
  "commands": {
    "perms": [
      '1106553480803516437',
      '1107345436492185753',
      '1106553536839422022',
      '1363927756617941154',
      '1202685031219200040',
      '1377754136824778885'
    ]
  },
  "season": {
    "maxRounds": calcMaxRounds(maxTeams)
  },
  "round": {
    "startDay": 1,
    "startHour": 19
  },
  "division": {
    maxTeams
  },
  "match": {
    "defaultSetsLength": 3,
    "defaultStartDays": [
      5, 6, 0
    ],
    "defaultStartHour": 19,
    "deadlineDay": 5,
    "deadlineHour": 11,
    "deadlineMinute": 59,
    "channels": {
      "prefix": '「🎮」'
    }
  },
  "team": {
    "maxMembers": 5,
    "channels": {
      "prefix": '「👥」'
    }
  }
}
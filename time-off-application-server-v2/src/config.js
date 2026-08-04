const dbDev = {
  host: "dbsvmc1d",
  port: 13001,
  user: "timeoffadm",
  password: "Time0ff@dm",
  database: "time_off_v2"
};

const dbProd = {
  host: "localhost",
  port: 3306,
  user: "timeoffadm",
  password: "Time0ff@dm",
  database: "time_off_v2"
};

const configs = {
  port: 8080,
  logFile: "server.log",
  db: process.env.NODE_ENV === "production" ? dbProd : dbDev,
  email: {
    host: "mailcorphts.server.ha.org.hk",
    port: {
      smtp: 25,
      imap: 993
    },
    username: "sc3support3",
    password: "t1user@admin",
    address: "sc3support3@ho.ha.org.hk",
    folder: "Time Off v2"
  },
  debug: {
    corpId: "tot885",
    email: "tot885@ha.org.hk"
  }
};

module.exports = configs;
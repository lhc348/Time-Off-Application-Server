const smtp = require("./smtp");
const imap = require("./imap");

module.exports = {
  ...smtp,
  ...imap,
  close: () => {
    smtp.close();
    imap.close();
  }
};
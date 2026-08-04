const ntlm = require("express-ntlm");

const ntlmMiddleware = ntlm({
  domain: "corp.ha.org.hk",
  domaincontroller: "ldaps://corp.ha.org.hk",
  tlsOptions: {
    rejectUnauthorized: false
  }
});

module.exports = ntlmMiddleware;
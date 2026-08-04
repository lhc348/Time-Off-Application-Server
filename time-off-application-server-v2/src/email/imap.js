const imap = require("imap-simple");
const { email } = require("../config");
const { compile } = require("html-to-text");

const convert = compile({
  wordwrap: false
});

const connectionPromise = imap
  .connect({
    imap: {
      host: email.host,
      port: email.port.imap,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      user: email.username,
      password: email.password
    }
  });

exports.searchPendingActions = async () => {
  const connection = await connectionPromise;
  await connection.openBox(`INBOX/${email.folder}`);

  const searchCriteria = ["UNSEEN"];
  const fetchOptions = {
    bodies: ["HEADER", "TEXT"],
    markSeen: true
  };

  const unreadEmails = await connection.search(searchCriteria, fetchOptions);
  const pendingActions = [];
  for (const email of unreadEmails) {
    const headers = email.parts.find(({ which }) => which === "HEADER").body;
    const subject = headers.subject[0];
    if (subject.startsWith("[Time Off Application v2] Action")) {
      const approverEmail = headers.from[0];
      const body = email.parts.find(({ which }) => which === "TEXT").body;
      const key = convert(body).split("\n").pop();
      try {
        if (approverEmail.includes("wyman.fung")) {
          const decodedString = Buffer.from(key, 'base64').toString('ascii');
          const lines = decodedString.split('\n');
          const targetLine = lines[lines.length - 5];
          const base64str = targetLine.match(/<p>([^<]+) <o:p>/)[1];
          const asciistr = Buffer.from(base64str, "base64").toString("ascii")
          const action = JSON.parse(asciistr);
          pendingActions.push({ ...action, approverEmail });
        } else {          
          const action = JSON.parse(Buffer.from(key, "base64").toString("ascii"));
          pendingActions.push({ ...action, approverEmail });
        }
        //const action = JSON.parse(Buffer.from(key, "base64").toString("ascii"));
        //const decodedString = Buffer.from(key, 'base64').toString('ascii');
        //const lines = decodedString.split('\n');
        //const targetLine = lines[lines.length - 5];
        //const base64str = targetLine.match(/<p>([^<]+) <o:p>/)[1];
        //const asciistr = Buffer.from(base64str, "base64").toString("ascii")
        //const action = JSON.parse(asciistr);
        //pendingActions.push({ ...action, approverEmail });
      } catch (error) {
        throw "Failed to parse email content. It may have been edited incorrectly.";
      }
    }
  }

  return pendingActions;
};


exports.close = () => imap.end();

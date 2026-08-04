const dedent = require("dedent");
const dayjs = require("dayjs");
const { email } = require("../config");

exports.renderActionEmailMailTo = (action, { id, officer, task, timeOffs }) => {
  const fullName = `${officer.firstName} ${officer.lastName}`;

  const timeOffsBody = timeOffs.map(({ date, session }) => `
        Date: ${dayjs(date).format("DD/MM/YYYY")}
        Session: ${session}        
  `).join("");
  const key = Buffer.from(JSON.stringify({
    action,
    applicationId: id
  })).toString("base64");

  const subject = `[Time Off Application v2] Action: Application ${id} `;

  const body = dedent(`
    Action: ${action}    
    Application ID: ${id}

    Officer: ${fullName}
    
    Tasks:
        Date: ${dayjs(task.date).format("DD/MM/YYYY HH:mm")}
        Status: ${task.status}
        Onsite: ${task.onsite}
        Details:
            ${task.details?.replace(/\n/gi, "\n            ")}
      
    Time Offs: 
        ${timeOffsBody}

    ***************************************************************
    Please send this email to the system to complete the process.
    Please do not modify any contents below this line.
    ***************************************************************

    ${key}
`);
  return dedent(`
    mailto:${email.address}
    ?subject=${encodeURIComponent(subject)}
    &body=${encodeURIComponent(body)}
`);
};

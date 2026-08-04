const schedule = require("node-schedule");
const db = require("./db");
const email = require("./email");

// run every minute
schedule.scheduleJob("*/1 * * * *", async () => {
  const pendingActions = await email.searchPendingActions();

  for (const { applicationId, action: status, approverEmail } of pendingActions) {
    await db.updateApplicationStatus(applicationId, status);
    const application = await db.queryApplication(applicationId);
    await email.applicationStatusUpdate(application, approverEmail, status);
  }
});
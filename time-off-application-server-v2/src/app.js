require("./scheduleTasks");

const express = require("express");
const compression = require("compression");
const { createHttpTerminator } = require("http-terminator");
const { port, debug } = require("./config");
const asyncHandler = require("express-async-handler");
const urls = require("./urls");
const ntlm = require("./middleware/ntlm");
const db = require("./db");
const email = require("./email");
const { parse } = require("json2csv");

const app = express();

app.use(compression());
app.use(express.json());
app.use(express.static("app"));

if (process.env.NODE_ENV === "production") app.use(ntlm);

app.get("/", (_, res) => res.sendFile("index.html", { root: "app" }));



app.get(urls.OFFICER, asyncHandler(async (req, res) => {
  const corpId = process.env.NODE_ENV === "production" ? req.ntlm.UserName : debug.corpId;
  const officer = await db.queryOfficer(corpId);
  res.json(officer);
}));

app.get(urls.ACTING_APPROVER, asyncHandler(async (_, res) => {
  const actingApprovers = await db.queryActingApprovers();
  res.json(actingApprovers);
}));

app.get(urls.APPLICATION, asyncHandler(async (req, res) => {
  const corpId = process.env.NODE_ENV === "production" ? req.ntlm.UserName : debug.corpId;
  const applications = await db.queryApplications(corpId);

  res.json(applications);
}));

app.post(`${urls.APPLICATION}/:id/:status`, asyncHandler(async (req, res) => {
  const { id, status } = req.params;
  await db.updateApplicationStatus(id, status);

  res.json({ status: "OK" });
}));

app.post(urls.APPLY, asyncHandler(async (req, res) => {
  const { application, actingApproverCorpId } = req.body;

  const applicationId = await db.submitApplication(application);
  const officer = await db.queryOfficer(application.officer);

  email.confirmApplication(null, { id: applicationId, ...application, officer });
  email.applicationRequestApproval(null, { id: applicationId, ...application, officer }, actingApproverCorpId);

  res.json({ status: "OK" });
}));

app.post(`${urls.APPLY}/:id`, asyncHandler(async (req, res) => {
  const { application, actingApproverCorpId } = req.body;
  const { id } = req.params;

  const oldApplication = await db.queryApplication(id);
  await db.updateApplication(application);
  const newApplication = await db.queryApplication(id);

  email.confirmApplication(oldApplication, newApplication);
  email.applicationRequestApproval(oldApplication, newApplication, actingApproverCorpId);

  res.json({ status: "OK" });
}));

app.get(urls.REPORT, asyncHandler(async (req, res) => {
  const { startDate, endDate, bs } = req.query;
  const bodyshopper = bs ? bs.toLocaleLowerCase() === "true" : null;

  const report = await db.generateReport({ startDate, endDate, bodyshopper });

  const csv = parse(report, {
    fields: [
      "Name",
      "Rank",
      "Scheduled / Non-scheduled",
      "Example",
      "Rank for Approving OT Work",
      "Approval Given with Documentation Supported (Y/N)",
      "Forms of Documentation",
      "Date",
      "Weekday",
      "Time Start",
      "Time End",
      "hour",
      "min",
      "Considerations Given in Approving Overtime Work",
      "Remark"
    ]
  });
  res.attachment("report.csv").send(csv);
}));

// client-side routing
app.get("*", (_, res) => res.sendFile("index.html", { root: "public" }));

const server = app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});

const httpTerminator = createHttpTerminator({ server });

const closeServer = async () => {
  try {
    await httpTerminator.terminate();
    console.log("App terminated.");
  } catch (error) {
    console.log("Fail to terminate app.");
    console.error(error);
    throw error;
  }
};

const shutdown = async () => {
  try {
    email.close();
    await db.close();
    await closeServer();
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
};

process
  .once("SIGTERM", shutdown)
  .once("SIGINT", shutdown);
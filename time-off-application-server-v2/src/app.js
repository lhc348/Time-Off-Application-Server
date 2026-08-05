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

// Helper: calculate OT duration in minutes based on timeOffs
function calculateOtDurationMinutes(timeOffs) {
  if (!timeOffs || timeOffs.length === 0) return 0;
  // If multiple timeOff entries count as a full day
  if (timeOffs.length > 1) return 7 * 60 + 48; // 7h48m = 468 minutes
  const session = (timeOffs[0].session || "").toLowerCase();
  if (session === "full day" || session === "fullday" || session === "full-day") return 7 * 60 + 48;
  // default to half day
  return 3 * 60 + 54; // 3h54m = 234 minutes
}

// Helper: check whether [start, end) intersects office hours (08:45-17:33) on any weekday
function intersectsOfficeHoursOnWeekday(start, end) {
  if (!(start instanceof Date)) start = new Date(start);
  if (!(end instanceof Date)) end = new Date(end);

  // if end <= start, no intersection
  if (end <= start) return false;

  // Helper to clone date at midnight
  function atMidnight(d) {
    const n = new Date(d);
    n.setHours(0, 0, 0, 0);
    return n;
  }

  const dayStart = atMidnight(start);
  const lastDay = atMidnight(end);

  for (let d = new Date(dayStart); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // skip weekends

    const officeStart = new Date(d);
    officeStart.setHours(8, 45, 0, 0);
    const officeEnd = new Date(d);
    officeEnd.setHours(17, 33, 0, 0);

    // check overlap: start < officeEnd && end > officeStart
    if (start < officeEnd && end > officeStart) return true;
  }

  return false;
}

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

// Apply (create)
app.post(urls.APPLY, asyncHandler(async (req, res) => {
  const { application, actingApproverCorpId } = req.body;

  // Validate OT does not intersect office hours on weekdays
  try {
    const start = new Date(application.task.date);
    const durationMinutes = calculateOtDurationMinutes(application.timeOffs || []);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    if (intersectsOfficeHoursOnWeekday(start, end)) {
      return res.status(400).json({ status: "REJECTED", reason: "Overlaps office hours (08:45-17:33) on a weekday" });
    }
  } catch (err) {
    // If parsing fails, reject the request
    return res.status(400).json({ status: "REJECTED", reason: "Invalid task date or timeOffs" });
  }

  const applicationId = await db.submitApplication(application);
  const officer = await db.queryOfficer(application.officer);

  email.confirmApplication(null, { id: applicationId, ...application, officer });
  email.applicationRequestApproval(null, { id: applicationId, ...application, officer }, actingApproverCorpId);

  res.json({ status: "OK" });
}));

// Update existing application
app.post(`${urls.APPLY}/:id`, asyncHandler(async (req, res) => {
  const { application, actingApproverCorpId } = req.body;
  const { id } = req.params;

  // Validate OT does not intersect office hours on weekdays
  try {
    const start = new Date(application.task.date);
    const durationMinutes = calculateOtDurationMinutes(application.timeOffs || []);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    if (intersectsOfficeHoursOnWeekday(start, end)) {
      return res.status(400).json({ status: "REJECTED", reason: "Overlaps office hours (08:45-17:33) on a weekday" });
    }
  } catch (err) {
    return res.status(400).json({ status: "REJECTED", reason: "Invalid task date or timeOffs" });
  }

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

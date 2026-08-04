const { email, debug } = require("../config");
const db = require("../db");
const nodemailer = require("nodemailer");
const hbs = require("nodemailer-express-handlebars");
const { renderActionEmailMailTo } = require("./plainTextTemplates");
const path = require("path");
const lodashZip = require("lodash/zip");
const isEqual = require("lodash/isEqual");
const dayjs = require("dayjs");

const transporter = nodemailer.createTransport({
  host: email.host,
  port: email.port.smtp,
  tls: { rejectUnauthorized: false },
  auth: {
    user: email.username,
    pass: email.password
  }
});

transporter.use("compile", hbs({
  viewEngine: {
    partialsDir: path.resolve(__dirname, "./templates/partials"),
    defaultLayout: false,
    helpers: {
      diff: (oldValue, newValue) => oldValue !== undefined && oldValue !== null && oldValue !== newValue,
      zip: (arr1, arr2) => lodashZip(arr1 ?? [], arr2 ?? []),
      renderActionEmailMailTo,
      formatDate: date => date ? dayjs(date).format("YYYY-MM-DD") : undefined,
      formatDateTime: dateTime => dateTime ? dayjs(dateTime).format("YYYY-MM-DD HH:mm") : undefined,
      isMultiline: (oldValue, newValue) => oldValue?.split("\n")?.length > 1 || newValue?.split("\n")?.length > 1,
      isEqual
    }
  },
  viewPath: path.resolve(__dirname, "./templates")
}));

transporter.verify(error => {
  if (error) {
    console.error("Failed to create SMTP connection.");
    console.error(error);
  } else {
    console.log("SMTP connection created.");
  }
});

const getActingApprover = async actingApproverCorpId => {
  const actingApprovers = await db.queryActingApprovers();
  return actingApprovers.find(({ corpId }) => corpId === actingApproverCorpId);
};

exports.confirmApplication = async (oldApplication, newApplication) => {
  const officerFullName = `${newApplication.officer.firstName} ${newApplication.officer.lastName} `;

  await transporter.sendMail({
    from: email.address,
    to: process.env.NODE_ENV === "production" ? newApplication.officer.email : debug.email,
    subject: `[Time Off Application v2] ${officerFullName} - Application submitted`,
    template: "applicationConfirm",
    context: { oldApplication, newApplication }
  });
};

exports.applicationRequestApproval = async (oldApplication, newApplication, actingApproverCorpId) => {
  const officerFullName = `${newApplication.officer.firstName} ${newApplication.officer.lastName} `;
  const approver = await db.queryApprover();

  const currentApprover = actingApproverCorpId
    ? getActingApprover(actingApproverCorpId) ?? approver
    : approver;

  await transporter.sendMail({
    from: email.address,
    to: process.env.NODE_ENV === "production"
      ? currentApprover.email
      : debug.email,
    cc: process.env.NODE_ENV === "production" ? approver.email : debug.email,
    subject: `[Time Off Application v2] ${officerFullName} - Request for approval`,
    template: "applicationRequestApproval",
    context: { oldApplication, newApplication, approver: currentApprover }
  });
};

exports.applicationStatusUpdate = async (application, approverEmail, status) => {
  const officerFullName = `${application.officer.firstName} ${application.officer.lastName}`;

  await transporter.sendMail({
    from: email.address,
    to: process.env.NODE_ENV === "production" ? application.officer.email : debug.email,
    cc: process.env.NODE_ENV === "production" ? approverEmail : debug.email,
    subject: `[Time Off Application v2] ${officerFullName} - Application ${status}`,
    template: "applicationStatusUpdate",
    context: { application, status }
  });
};

exports.close = () => transporter.close();
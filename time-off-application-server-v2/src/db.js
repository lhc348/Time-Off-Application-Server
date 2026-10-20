const mysql = require("mysql2/promise");
const { db } = require("./config");
const sqls = require("./sqls");
const dayjs = require("dayjs");

const pool = mysql.createPool({
  connectionLimit: 2,
  host: db.host,
  port: db.port,
  user: db.user,
  password: db.password,
  database: db.database
});

exports.queryOfficer = async corpId => {
  const [officers] = await pool.query(sqls.QUERY_OFFICER, [corpId]);
  return officers?.[0];
};

exports.queryApprover = async corpId => {
  const [approvers] = await pool.query(sqls.QUERY_APPROVERS, [corpId]);
  return approvers?.[0];
};

exports.queryActingApprovers = async () => {
  const [actingApprovers] = await pool.query(sqls.QUERY_ACTING_APPROVERS);
  return actingApprovers;
};

exports.queryApplication = async applicationId => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [applications] = await connection.query(sqls.QUERY_APPLICATION_BY_ID, [applicationId]);
    const [timeOffs] = await connection.query(sqls.QUERY_TIME_OFFS_BY_APPLICATION_ID, [applicationId]);

    await connection.commit();

    const incompleteApplication = applications?.[0];

    return incompleteApplication
      ? {
          id: incompleteApplication.id,
          status: incompleteApplication.status,
          lastUpdated: incompleteApplication.last_updated,
          officer: {
            corpId: incompleteApplication.corp_id,
            firstName: incompleteApplication.first_name,
            lastName: incompleteApplication.last_name,
            email: incompleteApplication.email
          },
          timeOffs,
          task: {
            date: incompleteApplication.task_date,
            status: incompleteApplication.task_status,
            onsite: incompleteApplication.task_onsite === 1,
            details: incompleteApplication.task_details
          }
        }
      : undefined;
  } catch (err) {
    await connection.rollback();
    console.error("queryApplication failed:", err);
    throw err;
  } finally {
    connection.release();
  }
};

exports.queryApplications = async corpId => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [incompleteApplications] = await connection.query(sqls.QUERY_APPLICATIONS, [corpId]);

    const applications = [];
    for (const incompleteApplication of incompleteApplications) {
      const [timeOffs] = await connection.query(
        sqls.QUERY_TIME_OFFS_BY_APPLICATION_ID,
        [incompleteApplication.id]
      );

      applications.push({
        id: incompleteApplication.id,
        status: incompleteApplication.status,
        lastUpdated: incompleteApplication.last_updated,
        officer: {
          corpId: incompleteApplication.corp_id,
          firstName: incompleteApplication.first_name,
          lastName: incompleteApplication.last_name,
          email: incompleteApplication.email
        },
        timeOffs,
        task: {
          date: incompleteApplication.task_date,
          status: incompleteApplication.task_status,
          onsite: incompleteApplication.task_onsite === 1,
          details: incompleteApplication.task_details
        }
      });
    }

    await connection.commit();
    return applications;
  } catch (err) {
    await connection.rollback();
    console.error("queryApplications failed:", err);
    throw err;
  } finally {
    connection.release();
  }
};

/**
 * Helper: format start_time only for 1/4 Day sessions.
 * - Accepts (session, startTime)
 * - Case-insensitive check for "1/4 Day"
 * - Returns formatted 'YYYY-MM-DD HH:mm:ss' or null
 * - Does NOT throw: validation should be handled earlier in the route layer.
 */
const formatTimeOffStartTime = (session, startTime) => {
  if (!session || (session || "").toLowerCase() !== "1/4 day") return null;
  if (!startTime) return null;
  const s = dayjs(startTime);
  return s.isValid() ? s.format("YYYY-MM-DD HH:mm:ss") : null;
};

exports.submitApplication = async ({ officer, timeOffs, task, submitToHR }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [{ insertId: applicationId }] = await connection.query(
      sqls.INSERT_APPLICATION,
      [
        officer,
        dayjs(task.date).format("YYYY-MM-DD HH:mm:ss"),
        task.status,
        task.onsite,
        task.details,
        submitToHR
      ]
    );

    const timeOffValues = (timeOffs || []).map(({ date, session, startTime }) => ([
      applicationId,
      dayjs(date).format("YYYY-MM-DD"),
      formatTimeOffStartTime(session, startTime),
      session
    ]));

    if (timeOffValues.length > 0) {
      await connection.query(sqls.INSERT_TIME_OFF, [timeOffValues]);
    }

    await connection.commit();
    return applicationId;
  } catch (err) {
    await connection.rollback();
    console.error("submitApplication failed:", err);
    throw err;
  } finally {
    connection.release();
  }
};

exports.updateApplication = async ({ id, officer, timeOffs, task, submitToHR }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      sqls.UPDATE_APPLICATION,
      [
        officer,
        dayjs(task.date).format("YYYY-MM-DD HH:mm:ss"),
        task.status,
        task.onsite,
        task.details,
        submitToHR,
        id
      ]
    );

    await connection.query(sqls.DELETE_TIME_OFF, [id]);

    const timeOffValues = (timeOffs || []).map(({ date, session, startTime }) => ([
      id,
      dayjs(date).format("YYYY-MM-DD"),
      formatTimeOffStartTime(session, startTime),
      session
    ]));

    if (timeOffValues.length > 0) {
      await connection.query(sqls.INSERT_TIME_OFF, [timeOffValues]);
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    console.error("updateApplication failed:", err);
    throw err;
  } finally {
    connection.release();
  }
};

exports.updateApplicationStatus = async (applicationId, status) => {
  await pool.query(sqls.UPDATE_APPLICATION_STATUS, [status, applicationId]);
};

exports.generateReport = async ({ startDate, endDate, bodyshopper }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(sqls.DISABLE_ONLY_FULL_GROUP_BY);
    const [report] = await connection.query(
      sqls.GENERATE_REPORT,
      [startDate, endDate, bodyshopper, bodyshopper]
    );
    await connection.query(sqls.ENABLE_ONLY_FULL_GROUP_BY);

    await connection.commit();
    return report;
  } catch (err) {
    await connection.rollback();
    console.error("generateReport failed:", err);
    throw err;
  } finally {
    connection.release();
  }
};

exports.close = async () => {
  await pool.end();
};

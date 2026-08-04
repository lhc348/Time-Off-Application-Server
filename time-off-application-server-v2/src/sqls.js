module.exports = {
  QUERY_OFFICER: `
    SELECT 
      corp_id AS corpId, 
      first_name AS firstName, 
      last_name AS lastName, 
      email
    FROM officer
    WHERE corp_id = ?
  `,
  QUERY_APPROVERS: `
    SELECT 
      corp_id AS corpId, 
      first_name AS firstName, 
      last_name AS lastName, 
      email
    FROM officer
    WHERE approver = TRUE
  `,
  QUERY_ACTING_APPROVERS: `
    SELECT 
      corp_id AS corpId, 
      first_name AS firstName, 
      last_name AS lastName, 
      email
    FROM officer
    WHERE acting_approver = TRUE
  `,
  INSERT_APPLICATION: `
    INSERT INTO application (officer_corp_id, task_date, task_status, task_onsite, task_details, submit_to_hr)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  INSERT_TIME_OFF: `
    INSERT INTO time_off (application_id, date, session)
    VALUES ?
  `,
  UPDATE_APPLICATION_STATUS: `
    UPDATE application SET status = ? WHERE id = ? AND status <> 'withdrawn'
  `,
  QUERY_APPLICATION_BY_ID: `
    SELECT * 
    FROM application LEFT JOIN officer
      ON officer_corp_id = corp_id
    WHERE id = ?
  `,
  QUERY_TIME_OFFS_BY_APPLICATION_ID: `
    SELECT date, session FROM time_off WHERE application_id = ?
  `,
  QUERY_APPLICATIONS: `
    SELECT * 
    FROM application 
    LEFT JOIN officer
      ON officer_corp_id = corp_id
    WHERE corp_id = ?
    ORDER BY last_updated DESC
  `,
  UPDATE_APPLICATION: `
    UPDATE application 
    SET
      officer_corp_id = ?,
      task_date = ?,
      task_status = ?,
      task_onsite = ?,
      task_details = ?,
      submit_to_hr = ?
    WHERE id = ?
  `,
  DELETE_TIME_OFF: `
    DELETE FROM time_off WHERE application_id = ?
  `,
  ENABLE_ONLY_FULL_GROUP_BY: "SET SESSION sql_mode='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
  DISABLE_ONLY_FULL_GROUP_BY: "SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
  GENERATE_REPORT: `
    SELECT 
      CONCAT(first_name, ' ', last_name) AS Name,
      \`rank\` AS 'Rank',
      task_status AS 'Scheduled / Non-scheduled',
      CASE
        WHEN task_status = 'scheduled' THEN 'Schedule Maintenance'
        ELSE 'Incident support'
      END AS Example,
      'SM' AS 'Rank for Approving OT Work',
      'Y' AS 'Approval Given with Documentation Supported (Y/N)',
      'Email' AS 'Forms of Documentation',
      DATE_FORMAT(task_date, '%e-%b-%y') AS 'Date',
      DAYNAME(task_date) AS 'Weekday',
      DATE_FORMAT(task_date, '%k:%i') AS 'Time Start',
      DATE_FORMAT(
        CASE
          WHEN
            COUNT(time_off.session) > 1
            OR (
              COUNT(time_off.session) = 1
              AND time_off.session = 'full day'
            )
          THEN ADDTIME(task_date, '7:48')
          ELSE ADDTIME(task_date, '3:54')
        END,
        '%k:%i'
      ) AS "Time End",
      HOUR(
        CASE
          WHEN
            COUNT(time_off.session) > 1
            OR (
              COUNT(time_off.session) = 1
              AND time_off.session = 'full day'
            )
          THEN TIME('7:48')
          ELSE TIME('3:54')
        END
      ) AS "hour",
      MINUTE(
        CASE
          WHEN
            COUNT(time_off.session) > 1
            OR (
              COUNT(time_off.session) = 1
              AND time_off.session = 'full day'
            )
          THEN TIME('7:48')
          ELSE TIME('3:54')
        END
      ) AS "min",
      task_details AS 'Considerations Given in Approving Overtime Work',
      GROUP_CONCAT(
        DISTINCT 'TimeOff on ', time_off.date, ' ', time_off.session
        ORDER BY time_off.date
        SEPARATOR '\n'
      ) AS 'Remark'
    FROM
      application JOIN (officer, time_off)
      ON (
        officer_corp_id = corp_id
        AND application.id = application_id
      )
    WHERE
      submit_to_hr = TRUE
      AND application.status = 'approved'
      AND time_off.date >= ?
      AND time_off.date <= ?
      AND (? IS NULL OR body_shopper = ?)
    GROUP BY application.id
  `
};

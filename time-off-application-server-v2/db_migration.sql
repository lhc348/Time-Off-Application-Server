CREATE DATABASE time_off_v2;
GRANT ALL PRIVILEGES ON time_off_v2.* TO timeoffadm;
CREATE TABLE officer (
  corp_id varchar(255),
  last_name varchar(255) not null,
  first_name varchar(255) not null,
  email varchar(255) not null,
  approver boolean default false,
  acting_approver boolean default false,
  `rank` varchar(255),
  body_shopper boolean,
  PRIMARY KEY(corp_id)
);
CREATE TABLE application (
  id int AUTO_INCREMENT,
  last_updated datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  officer_corp_id varchar(255),
  task_date datetime,
  task_status enum('Scheduled', 'Non-Scheduled'),
  task_onsite boolean,
  task_details text,
  status enum('Pending', 'Approved', 'Rejected', 'Withdrawn') DEFAULT 'Pending',
  submit_to_hr boolean DEFAULT TRUE,
  PRIMARY KEY(id),
  FOREIGN KEY (officer_corp_id) REFERENCES officer (corp_id),
  KEY (last_updated DESC)
);
create table time_off (
  id int AUTO_INCREMENT,
  application_id int,
  `date` date,
  session enum('AM', 'PM', 'Full Day'),
  PRIMARY KEY (`id`),
  FOREIGN KEY (`application_id`) REFERENCES `application` (`id`) ON DELETE CASCADE
);
insert into officer
select corp_id,
  last_name,
  first_name,
  email,
  approver,
  acting_approver,
  `rank`,
  body_shopper
from time_off.officer;
insert into application
select a.id AS id,
  a.last_updated as last_updated,
  o.corp_id as officer_corp_id,
  t.start_date_time as task_date,
  t.status as task_status,
  CASE
    (t.onsite)
    WHEN 'Yes' THEN TRUE
    ELSE FALSE
  END as task_onsite,
  t.details AS task_details,
  a.status AS status
from time_off.application a
  JOIN time_off.officer o ON a.officer_id = o.id
  JOIN time_off.task t ON a.id = t.application_id;
insert into time_off
select *
from time_off.time_off;
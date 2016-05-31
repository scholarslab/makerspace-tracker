
CREATE TABLE IF NOT EXISTS prints (
  print_id SERIAL PRIMARY KEY,
  patron_id VARCHAR (50) NOT NULL,
  patron_grade VARCHAR (100) NOT NULL,
  patron_department VARCHAR (100) NOT NULL,
  tech_id VARCHAR (20) NOT NULL,
  date_created TIMESTAMP NOT NULL DEFAULT CURRENT_DATE,
  date_modified TIMESTAMP,
  date_started TIMESTAMP,
  date_finished TIMESTAMP,
  printer_setup TEXT,
  notes TEXT,
  image_file VARCHAR (255),
  print_file VARCHAR (255)
);

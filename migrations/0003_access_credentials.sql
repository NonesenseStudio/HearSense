CREATE TABLE access_credentials (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  password_md5 TEXT NOT NULL CHECK (
    length(password_md5) = 32 AND
    password_md5 NOT GLOB '*[^0-9a-f]*'
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

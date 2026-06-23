-- Seed data for Employee Directory regression test fixture
-- Passwords: all accounts use 'Password123!' (bcrypt hash is a placeholder)
-- F-V2-02: password_hash_legacy = md5('Password123!') = 4a7d1ed414474e4033ac29ccb8653d9b

INSERT OR IGNORE INTO users (username, email, password_hash, password_hash_legacy, role)
VALUES
  (
    'admin',
    'admin@gov.ab.ca',
    -- Placeholder bcrypt hash for 'Password123!' at cost 12
    -- Replace with: node -e "require('bcrypt').hash('Password123!',12).then(console.log)"
    '$2b$12$placeholder_hash_admin_Password123X',
    '4a7d1ed414474e4033ac29ccb8653d9b',   -- md5('Password123!')
    'admin'
  ),
  (
    'jsmith',
    'john.smith@gov.ab.ca',
    '$2b$12$placeholder_hash_jsmith_Password123X',
    '4a7d1ed414474e4033ac29ccb8653d9b',   -- md5('Password123!')
    'user'
  );

-- Protected A employee records: staff names, emails, phone numbers, salaries
INSERT OR IGNORE INTO employees (name, email, phone, department, employee_id, manager_id, salary)
VALUES
  ('John Smith',     'john.smith@gov.ab.ca',     '780-415-1001', 'IT Services', 'EMP-001', NULL,  95000.00),
  ('Mary Jones',     'mary.jones@gov.ab.ca',      '780-415-1002', 'Finance',     'EMP-002', NULL,  88000.00),
  ('Robert Chen',    'robert.chen@gov.ab.ca',     '780-415-1003', 'IT Services', 'EMP-003', 1,     82000.00),
  ('Sarah Williams', 'sarah.williams@gov.ab.ca',  '780-415-1004', 'HR',          'EMP-004', NULL,  75000.00),
  ('David Brown',    'david.brown@gov.ab.ca',     '780-415-1005', 'Legal',       'EMP-005', NULL, 105000.00);

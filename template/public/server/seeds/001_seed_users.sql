-- Seed: 001_seed_users.sql
-- 5 user accounts: 3 admins, 2 regular users
-- UUIDs use 11111111-xxxx prefix for users

INSERT INTO user_account (
  pk_user_account,
  user_email_address,
  user_display_name,
  sso_provider_name,
  sso_provider_id,
  google_id,
  microsoft_id,
  user_role_name,
  avatar_url,
  is_active
) VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'admin.portal@example.com',
    'Portal Admin',
    'google',
    'google-admin-001',
    'google-admin-001',
    NULL,
    'admin',
    NULL,
    true
  ),
  (
    '11111111-1111-1111-1111-222222222222',
    'admin.ops@example.com',
    'Operations Manager',
    'microsoft',
    'ms-admin-002',
    NULL,
    'ms-admin-002',
    'admin',
    NULL,
    true
  ),
  (
    '11111111-1111-1111-1111-333333333333',
    'admin.data@example.com',
    'Data Analyst Admin',
    'google',
    'google-admin-003',
    'google-admin-003',
    NULL,
    'admin',
    NULL,
    true
  ),
  (
    '11111111-1111-1111-1111-444444444444',
    'user.resident@example.com',
    'Jane Resident',
    'google',
    'google-user-001',
    'google-user-001',
    NULL,
    'user',
    NULL,
    true
  ),
  (
    '11111111-1111-1111-1111-555555555555',
    'user.applicant@example.com',
    'Bob Applicant',
    'microsoft',
    'ms-user-002',
    NULL,
    'ms-user-002',
    'user',
    NULL,
    true
  )
ON CONFLICT (pk_user_account) DO NOTHING;

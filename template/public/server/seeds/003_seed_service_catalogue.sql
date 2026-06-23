-- Seed: 003_seed_service_catalogue.sql
-- 15 services across 5 categories (3 per category)
-- UUIDs use 77777777-xxxx prefix for services
-- Category FKs reference categories by subquery (idempotent)

INSERT INTO service_catalogue (
  pk_service_catalogue,
  fk_service_catalogue_service_category,
  service_title,
  service_description_brief,
  service_description_full,
  service_eligibility,
  service_how_to_apply,
  service_required_documents,
  service_contact_phone,
  service_contact_email,
  is_published,
  is_deleted
) VALUES
  -- Emergency Services (3)
  (
    '77777777-0001-0001-0001-000000000001',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Emergency Services'),
    'Service A',
    'Short description of Service A.',
    'Full description of Service A. This is sample seed data illustrating the service-catalogue row shape; replace with your own content.',
    'Sample eligibility text for Service A.',
    'Sample how-to-apply text for Service A.',
    'Sample required documents for Service A.',
    '1-800-555-0101',
    'service-a@example.com',
    true,
    false
  ),
  (
    '77777777-0001-0001-0001-000000000002',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Emergency Services'),
    'Service B',
    'Short description of Service B.',
    'Full description of Service B. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service B.',
    'Sample how-to-apply text for Service B.',
    'Sample required documents for Service B.',
    '1-800-555-0102',
    'service-b@example.com',
    true,
    false
  ),
  (
    '77777777-0001-0001-0001-000000000003',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Emergency Services'),
    'Service C',
    'Short description of Service C.',
    'Full description of Service C. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service C.',
    'Sample how-to-apply text for Service C.',
    'Sample required documents for Service C.',
    '1-800-555-0103',
    'service-c@example.com',
    true,
    false
  ),

  -- Financial Assistance (3)
  (
    '77777777-0001-0001-0001-000000000004',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Financial Assistance'),
    'Service D',
    'Short description of Service D.',
    'Full description of Service D. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service D.',
    'Sample how-to-apply text for Service D.',
    'Sample required documents for Service D.',
    '1-800-555-0104',
    'service-d@example.com',
    true,
    false
  ),
  (
    '77777777-0001-0001-0001-000000000005',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Financial Assistance'),
    'Service E',
    'Short description of Service E.',
    'Full description of Service E. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service E.',
    'Sample how-to-apply text for Service E.',
    'Sample required documents for Service E.',
    '1-800-555-0105',
    'service-e@example.com',
    true,
    false
  ),
  (
    '77777777-0001-0001-0001-000000000006',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Financial Assistance'),
    'Service F',
    'Short description of Service F.',
    'Full description of Service F. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service F.',
    'Sample how-to-apply text for Service F.',
    'Sample required documents for Service F.',
    '1-800-555-0106',
    'service-f@example.com',
    true,
    false
  ),

  -- Recovery Support (3)
  (
    '77777777-0001-0001-0001-000000000007',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Recovery Support'),
    'Service G',
    'Short description of Service G.',
    'Full description of Service G. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service G.',
    'Sample how-to-apply text for Service G.',
    'Sample required documents for Service G.',
    '1-800-555-0107',
    'service-g@example.com',
    true,
    false
  ),
  (
    '77777777-0001-0001-0001-000000000008',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Recovery Support'),
    'Service H',
    'Short description of Service H.',
    'Full description of Service H. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service H.',
    'Sample how-to-apply text for Service H.',
    'Sample required documents for Service H.',
    '1-800-555-0108',
    'service-h@example.com',
    true,
    false
  ),
  (
    '77777777-0001-0001-0001-000000000009',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Recovery Support'),
    'Service I',
    'Short description of Service I.',
    'Full description of Service I. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service I.',
    'Sample how-to-apply text for Service I.',
    'Sample required documents for Service I.',
    '1-800-555-0109',
    'service-i@example.com',
    true,
    false
  ),

  -- Reporting (3)
  (
    '77777777-0001-0001-0001-000000000010',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Reporting'),
    'Service J',
    'Short description of Service J.',
    'Full description of Service J. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service J.',
    'Sample how-to-apply text for Service J.',
    'Sample required documents for Service J.',
    '310-0000',
    'service-j@example.com',
    true,
    false
  ),
  (
    '77777777-0001-0001-0001-000000000011',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Reporting'),
    'Service K',
    'Short description of Service K.',
    'Full description of Service K. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service K.',
    'Sample how-to-apply text for Service K.',
    'Sample required documents for Service K.',
    '1-800-555-0111',
    'service-k@example.com',
    true,
    false
  ),
  (
    '77777777-0001-0001-0001-000000000012',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Reporting'),
    'Service L',
    'Short description of Service L.',
    'Full description of Service L. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service L.',
    'Sample how-to-apply text for Service L.',
    'Sample required documents for Service L.',
    '1-800-555-0112',
    'service-l@example.com',
    true,
    false
  ),

  -- Information (3)
  (
    '77777777-0001-0001-0001-000000000013',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Information'),
    'Service M',
    'Short description of Service M.',
    'Full description of Service M. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service M.',
    'Sample how-to-apply text for Service M.',
    'Sample required documents for Service M.',
    '1-800-555-0113',
    'service-m@example.com',
    true,
    false
  ),
  (
    '77777777-0001-0001-0001-000000000014',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Information'),
    'Service N',
    'Short description of Service N.',
    'Full description of Service N. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service N.',
    'Sample how-to-apply text for Service N.',
    'Sample required documents for Service N.',
    '1-800-555-0114',
    'service-n@example.com',
    true,
    false
  ),
  (
    '77777777-0001-0001-0001-000000000015',
    (SELECT pk_service_category FROM service_category WHERE category_name = 'Information'),
    'Service O',
    'Short description of Service O.',
    'Full description of Service O. Sample seed data — replace with your own content.',
    'Sample eligibility text for Service O.',
    'Sample how-to-apply text for Service O.',
    'Sample required documents for Service O.',
    '1-800-555-0115',
    'service-o@example.com',
    true,
    false
  )
ON CONFLICT (pk_service_catalogue) DO NOTHING;

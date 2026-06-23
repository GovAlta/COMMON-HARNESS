-- Seed: 006_seed_notifications.sql
-- Subscriptions, notification messages, and delivery records

-- Notification subscriptions for test users
INSERT INTO notification_subscription (
  pk_notification_subscription,
  fk_notification_subscription_user_account,
  subscription_type,
  subscription_target_id,
  subscription_region_name,
  filter_criteria
) VALUES
  -- Jane subscribes to resource updates for "Resource Item 1"
  (
    'aaa00001-0001-0001-0001-000000000001',
    '11111111-1111-1111-1111-444444444444',
    'resource',
    'aaaaaaaa-0001-4000-a000-000000000001',
    NULL,
    '{}'
  ),
  -- Jane subscribes to Region 1
  (
    'aaa00001-0001-0001-0001-000000000002',
    '11111111-1111-1111-1111-444444444444',
    'region',
    NULL,
    'Region 1',
    '{}'
  ),
  -- Jane subscribes to announcements
  (
    'aaa00001-0001-0001-0001-000000000003',
    '11111111-1111-1111-1111-444444444444',
    'broadcast',
    NULL,
    NULL,
    '{}'
  ),
  -- Bob subscribes to resource updates for "Resource Item 7"
  (
    'aaa00001-0001-0001-0001-000000000004',
    '11111111-1111-1111-1111-555555555555',
    'resource',
    'aaaaaaaa-0007-4000-a000-000000000007',
    NULL,
    '{}'
  ),
  -- Bob subscribes to Region 2
  (
    'aaa00001-0001-0001-0001-000000000005',
    '11111111-1111-1111-1111-555555555555',
    'region',
    NULL,
    'Region 2',
    '{}'
  ),
  -- Bob subscribes to announcements
  (
    'aaa00001-0001-0001-0001-000000000006',
    '11111111-1111-1111-1111-555555555555',
    'broadcast',
    NULL,
    NULL,
    '{}'
  ),
  -- Admin subscribes to Region 1
  (
    'aaa00001-0001-0001-0001-000000000007',
    '11111111-1111-1111-1111-111111111111',
    'region',
    NULL,
    'Region 1',
    '{}'
  )
ON CONFLICT (pk_notification_subscription) DO NOTHING;

-- Notification messages (8 messages: mix of resource_update, service_notice, announcement, general)
INSERT INTO notification_message (
  pk_notification_message,
  message_title,
  message_body,
  message_type,
  message_region_filter,
  fk_notification_message_resource_item,
  created_at
) VALUES
  (
    'bbb00001-0001-0001-0001-000000000001',
    'New Resource Published: Resource Item 1',
    'Sample notification body — a new resource has been published. Browse the resource library for details.',
    'resource_update',
    'Region 1',
    'aaaaaaaa-0001-4000-a000-000000000001',
    '2024-05-12 09:00:00+00'
  ),
  (
    'bbb00001-0001-0001-0001-000000000002',
    'Resource Item 7 Updated',
    'Sample notification body — a published resource item has been revised. Please review the changes.',
    'resource_update',
    NULL,
    'aaaaaaaa-0007-4000-a000-000000000007',
    '2024-05-14 16:00:00+00'
  ),
  (
    'bbb00001-0001-0001-0001-000000000003',
    'New Online Services Portal Launched',
    'Sample notification body — a new online services portal has launched. Access resources, submit forms, find service locations, and more at one convenient location.',
    'announcement',
    NULL,
    NULL,
    '2024-05-22 12:00:00+00'
  ),
  (
    'bbb00001-0001-0001-0001-000000000004',
    'Service Location Update: Location 4',
    'Sample notification body — a service location has moved. Updated address and hours are now available on the service locations map.',
    'service_notice',
    'Region 2',
    NULL,
    '2024-05-24 14:00:00+00'
  ),
  (
    'bbb00001-0001-0001-0001-000000000005',
    'Extended Hours: Location 7',
    'Sample notification body — extended hours on Thursdays effective immediately. New hours: 8:00 AM - 7:00 PM.',
    'service_notice',
    'Region 3',
    NULL,
    '2024-05-16 08:00:00+00'
  ),
  (
    'bbb00001-0001-0001-0001-000000000006',
    'New Forms Available: Service Feedback',
    'New digital forms are now available for submitting service feedback and requesting information. Sign in to access the forms.',
    'general',
    NULL,
    NULL,
    '2024-05-15 10:00:00+00'
  ),
  (
    'bbb00001-0001-0001-0001-000000000007',
    'Holiday Office Hours Notice',
    'Sample notification body — offices will observe modified hours during the upcoming statutory holiday. Please check the service locations map for specific office schedules.',
    'announcement',
    NULL,
    NULL,
    '2024-05-24 08:00:00+00'
  ),
  (
    'bbb00001-0001-0001-0001-000000000008',
    'New Guide Published: Resource Item 3',
    'Sample notification body — a new guide has been published. Find more information in the resource library.',
    'resource_update',
    NULL,
    'aaaaaaaa-0003-4000-a000-000000000003',
    '2024-05-14 11:00:00+00'
  )
ON CONFLICT (pk_notification_message) DO NOTHING;

-- Notification delivery records
INSERT INTO notification_delivery (
  pk_notification_delivery,
  fk_notification_delivery_notification_message,
  fk_notification_delivery_user_account,
  is_read,
  read_at,
  created_at
) VALUES
  -- Jane receives resource published notification (read)
  (
    'ccc00001-0001-0001-0001-000000000001',
    'bbb00001-0001-0001-0001-000000000001',
    '11111111-1111-1111-1111-444444444444',
    true,
    '2024-05-12 09:15:00+00',
    '2024-05-12 09:00:00+00'
  ),
  -- Jane receives privacy policy update (read)
  (
    'ccc00001-0001-0001-0001-000000000002',
    'bbb00001-0001-0001-0001-000000000002',
    '11111111-1111-1111-1111-444444444444',
    true,
    '2024-05-14 16:30:00+00',
    '2024-05-14 16:00:00+00'
  ),
  -- Jane receives portal launch announcement (unread)
  (
    'ccc00001-0001-0001-0001-000000000003',
    'bbb00001-0001-0001-0001-000000000003',
    '11111111-1111-1111-1111-444444444444',
    false,
    NULL,
    '2024-05-22 12:00:00+00'
  ),
  -- Jane receives holiday hours announcement (unread)
  (
    'ccc00001-0001-0001-0001-000000000004',
    'bbb00001-0001-0001-0001-000000000007',
    '11111111-1111-1111-1111-444444444444',
    false,
    NULL,
    '2024-05-24 08:00:00+00'
  ),
  -- Bob receives Calgary service location update (unread)
  (
    'ccc00001-0001-0001-0001-000000000005',
    'bbb00001-0001-0001-0001-000000000004',
    '11111111-1111-1111-1111-555555555555',
    false,
    NULL,
    '2024-05-24 14:00:00+00'
  ),
  -- Bob receives portal launch announcement (read)
  (
    'ccc00001-0001-0001-0001-000000000006',
    'bbb00001-0001-0001-0001-000000000003',
    '11111111-1111-1111-1111-555555555555',
    true,
    '2024-05-22 12:30:00+00',
    '2024-05-22 12:00:00+00'
  ),
  -- Bob receives holiday hours announcement (unread)
  (
    'ccc00001-0001-0001-0001-000000000007',
    'bbb00001-0001-0001-0001-000000000007',
    '11111111-1111-1111-1111-555555555555',
    false,
    NULL,
    '2024-05-24 08:00:00+00'
  ),
  -- Admin receives new forms notification (read)
  (
    'ccc00001-0001-0001-0001-000000000008',
    'bbb00001-0001-0001-0001-000000000006',
    '11111111-1111-1111-1111-111111111111',
    true,
    '2024-05-15 10:30:00+00',
    '2024-05-15 10:00:00+00'
  )
ON CONFLICT (pk_notification_delivery) DO NOTHING;

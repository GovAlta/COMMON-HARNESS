-- Seed: 006_seed_resource_items
-- Description: Insert sample resource items across all categories

INSERT INTO resource_item (
    pk_resource_item, resource_title, resource_status, resource_category,
    resource_summary, resource_content, resource_author, resource_region,
    resource_published_at, resource_tags, metadata
) VALUES
-- Guides (3)
(
    'aaaaaaaa-0001-4000-a000-000000000001',
    'Resource Item 1',
    'published', 'guide',
    'Short summary for Resource Item 1.',
    'Sample content body for Resource Item 1. Replace with real content for your application.',
    'Author 1', 'Region 1',
    NOW() - INTERVAL '30 days',
    '["sample", "guide"]'::jsonb,
    '{}'::jsonb
),
(
    'aaaaaaaa-0002-4000-a000-000000000002',
    'Resource Item 2',
    'published', 'guide',
    'Short summary for Resource Item 2.',
    'Sample content body for Resource Item 2. Replace with real content for your application.',
    'Author 1', 'Region 1',
    NOW() - INTERVAL '20 days',
    '["sample", "guide"]'::jsonb,
    '{}'::jsonb
),
(
    'aaaaaaaa-0003-4000-a000-000000000003',
    'Resource Item 3',
    'published', 'guide',
    'Short summary for Resource Item 3.',
    'Sample content body for Resource Item 3. Replace with real content for your application.',
    'Author 1', 'Region 1',
    NOW() - INTERVAL '15 days',
    '["sample", "guide"]'::jsonb,
    '{}'::jsonb
),
-- Announcements (3)
(
    'aaaaaaaa-0004-4000-a000-000000000004',
    'Resource Item 4',
    'published', 'announcement',
    'Short summary for Resource Item 4.',
    'Sample announcement body for Resource Item 4. Replace with real content for your application.',
    'Author 2', 'Region 1',
    NOW() - INTERVAL '5 days',
    '["sample", "announcement"]'::jsonb,
    '{}'::jsonb
),
(
    'aaaaaaaa-0005-4000-a000-000000000005',
    'Resource Item 5',
    'published', 'announcement',
    'Short summary for Resource Item 5.',
    'Sample announcement body for Resource Item 5. Replace with real content for your application.',
    'Author 2', 'Region 1',
    NOW() - INTERVAL '10 days',
    '["sample", "announcement"]'::jsonb,
    '{}'::jsonb
),
(
    'aaaaaaaa-0006-4000-a000-000000000006',
    'Resource Item 6',
    'draft', 'announcement',
    'Short summary for Resource Item 6.',
    'Sample announcement body for Resource Item 6. Replace with real content for your application.',
    'Author 2', 'Region 1',
    NULL,
    '["sample", "announcement"]'::jsonb,
    '{}'::jsonb
),
-- Policies (3)
(
    'aaaaaaaa-0007-4000-a000-000000000007',
    'Resource Item 7',
    'published', 'policy',
    'Short summary for Resource Item 7.',
    'Sample policy body for Resource Item 7. Replace with real content for your application.',
    'Author 3', 'Region 1',
    NOW() - INTERVAL '60 days',
    '["sample", "policy"]'::jsonb,
    '{}'::jsonb
),
(
    'aaaaaaaa-0008-4000-a000-000000000008',
    'Resource Item 8',
    'published', 'policy',
    'Short summary for Resource Item 8.',
    'Sample policy body for Resource Item 8. Replace with real content for your application.',
    'Author 3', 'Region 1',
    NOW() - INTERVAL '45 days',
    '["sample", "policy"]'::jsonb,
    '{}'::jsonb
),
(
    'aaaaaaaa-0009-4000-a000-000000000009',
    'Resource Item 9',
    'archived', 'policy',
    'Short summary for Resource Item 9.',
    'Sample archived policy body for Resource Item 9. Replace with real content for your application.',
    'Author 3', 'Region 1',
    NOW() - INTERVAL '90 days',
    '["sample", "policy"]'::jsonb,
    '{}'::jsonb
),
-- Reference (3)
(
    'aaaaaaaa-0010-4000-a000-000000000010',
    'Resource Item 10',
    'published', 'reference',
    'Short summary for Resource Item 10.',
    'Sample reference body for Resource Item 10. Replace with real content for your application.',
    'Author 4', 'Region 1',
    NOW() - INTERVAL '25 days',
    '["sample", "reference"]'::jsonb,
    '{}'::jsonb
),
(
    'aaaaaaaa-0011-4000-a000-000000000011',
    'Resource Item 11',
    'published', 'reference',
    'Short summary for Resource Item 11.',
    'Sample reference body for Resource Item 11. Replace with real content for your application.',
    'Author 4', 'Region 1',
    NOW() - INTERVAL '18 days',
    '["sample", "reference"]'::jsonb,
    '{}'::jsonb
),
(
    'aaaaaaaa-0012-4000-a000-000000000012',
    'Resource Item 12',
    'draft', 'reference',
    'Short summary for Resource Item 12.',
    'Sample reference body for Resource Item 12. Replace with real content for your application.',
    'Author 4', 'Region 1',
    NULL,
    '["sample", "reference"]'::jsonb,
    '{}'::jsonb
),
-- Bulletins (2)
(
    'aaaaaaaa-0013-4000-a000-000000000013',
    'Resource Item 13',
    'published', 'bulletin',
    'Short summary for Resource Item 13.',
    'Sample bulletin body for Resource Item 13. Replace with real content for your application.',
    'Author 5', 'Region 1',
    NOW() - INTERVAL '3 days',
    '["sample", "bulletin"]'::jsonb,
    '{}'::jsonb
),
(
    'aaaaaaaa-0014-4000-a000-000000000014',
    'Resource Item 14',
    'published', 'bulletin',
    'Short summary for Resource Item 14.',
    'Sample bulletin body for Resource Item 14. Replace with real content for your application.',
    'Author 5', 'Region 1',
    NOW() - INTERVAL '1 day',
    '["sample", "bulletin"]'::jsonb,
    '{}'::jsonb
)
ON CONFLICT (pk_resource_item) DO NOTHING;

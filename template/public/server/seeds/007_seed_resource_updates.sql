-- Seed: 007_seed_resource_updates
-- Description: Insert sample resource updates

INSERT INTO resource_update (
    pk_resource_update, fk_resource_update_resource_item,
    update_title, update_description, update_type
) VALUES
(
    'bbbbbbbb-0001-4000-b000-000000000001',
    'aaaaaaaa-0001-4000-a000-000000000001',
    'Sample revision update',
    'Sample revision content for the parent resource item.',
    'revision'
),
(
    'bbbbbbbb-0002-4000-b000-000000000002',
    'aaaaaaaa-0001-4000-a000-000000000001',
    'Sample supplement update',
    'Sample supplement content for the parent resource item.',
    'supplement'
),
(
    'bbbbbbbb-0003-4000-b000-000000000003',
    'aaaaaaaa-0002-4000-a000-000000000002',
    'Sample correction update',
    'Sample correction content for the parent resource item.',
    'correction'
),
(
    'bbbbbbbb-0004-4000-b000-000000000004',
    'aaaaaaaa-0003-4000-a000-000000000003',
    'Sample supplement update',
    'Sample supplement content for the parent resource item.',
    'supplement'
),
(
    'bbbbbbbb-0005-4000-b000-000000000005',
    'aaaaaaaa-0007-4000-a000-000000000007',
    'Sample revision update',
    'Sample revision content for the parent resource item.',
    'revision'
),
(
    'bbbbbbbb-0006-4000-b000-000000000006',
    'aaaaaaaa-0008-4000-a000-000000000008',
    'Sample supplement update',
    'Sample supplement content for the parent resource item.',
    'supplement'
),
(
    'bbbbbbbb-0007-4000-b000-000000000007',
    'aaaaaaaa-0009-4000-a000-000000000009',
    'Sample status change',
    'Sample status-change content for the parent resource item.',
    'status_change'
),
(
    'bbbbbbbb-0008-4000-b000-000000000008',
    'aaaaaaaa-0010-4000-a000-000000000010',
    'Sample revision update',
    'Sample revision content for the parent resource item.',
    'revision'
),
(
    'bbbbbbbb-0009-4000-b000-000000000009',
    'aaaaaaaa-0004-4000-a000-000000000004',
    'Sample supplement update',
    'Sample supplement content for the parent resource item.',
    'supplement'
),
(
    'bbbbbbbb-0010-4000-b000-000000000010',
    'aaaaaaaa-0013-4000-a000-000000000013',
    'Sample correction update',
    'Sample correction content for the parent resource item.',
    'correction'
)
ON CONFLICT (pk_resource_update) DO NOTHING;

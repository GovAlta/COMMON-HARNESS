-- reports.sql: Reporting queries for the analytics dashboard
-- Generated: 2026-03-03
-- Contains: main report query (SELECT *) and user aggregate query.
--
-- RISK_ACCEPTED: RA-009
SELECT r.id, r.title, r.content, r.created_at,
       u.username AS author
FROM reports r
LEFT JOIN users u ON r.author_id = u.id
ORDER BY r.created_at DESC;

-- Aggregated report count by user (no RA needed — read-only aggregate)
SELECT u.username, COUNT(r.id) AS report_count
FROM users u
LEFT JOIN reports r ON r.author_id = u.id
GROUP BY u.id, u.username
ORDER BY report_count DESC;

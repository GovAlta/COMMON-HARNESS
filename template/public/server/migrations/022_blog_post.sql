-- Migration 022: blog_post
-- DB-driven blog content. Admins author posts via /api/admin/blog/*;
-- the public reads via /api/blog and /api/blog/:slug.
--
-- Slug is the URL identifier — uniqueness enforced at the DB level so the
-- application code never has to disambiguate. Published-at + is_published
-- together let admins draft posts (is_published=false) or schedule future
-- posts (is_published=true with published_at in the future — readers see
-- only is_published=true AND published_at <= NOW()).

CREATE TABLE IF NOT EXISTS blog_post (
    pk_blog_post            UUID         NOT NULL DEFAULT gen_random_uuid(),
    post_slug               VARCHAR(200) NOT NULL,
    post_title              VARCHAR(300) NOT NULL,
    post_excerpt            VARCHAR(800) NULL,
    post_body               TEXT         NOT NULL,
    post_hero_image_url     VARCHAR(2048) NULL,
    post_author_name        VARCHAR(255) NULL,
    fk_blog_post_author     UUID         NULL,
    post_tags               JSONB        NOT NULL DEFAULT '[]'::jsonb,
    is_published            BOOLEAN      NOT NULL DEFAULT false,
    published_at            TIMESTAMPTZ  NULL,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by              UUID         NULL,
    updated_by              UUID         NULL,
    is_deleted              BOOLEAN      NOT NULL DEFAULT false,

    CONSTRAINT pk_blog_post              PRIMARY KEY (pk_blog_post),
    CONSTRAINT uq_blog_post_slug         UNIQUE (post_slug),
    CONSTRAINT fk_blog_post_author       FOREIGN KEY (fk_blog_post_author)
        REFERENCES user_account (pk_user_account) ON DELETE SET NULL,
    CONSTRAINT ck_blog_post_slug_format  CHECK (post_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE INDEX IF NOT EXISTS ix_blog_post_published      ON blog_post (is_published, published_at DESC) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS ix_blog_post_slug           ON blog_post (post_slug)                       WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS ix_blog_post_tags           ON blog_post USING GIN (post_tags)             WHERE is_deleted = false;

DROP TRIGGER IF EXISTS trg_blog_post_set_updated_at ON blog_post;
CREATE TRIGGER trg_blog_post_set_updated_at
    BEFORE UPDATE ON blog_post
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed a few sample posts so the new /blog page isn't empty on first run.
-- Idempotent via ON CONFLICT — re-running this migration is a no-op.
INSERT INTO blog_post (
    pk_blog_post, post_slug, post_title, post_excerpt, post_body,
    post_author_name, post_tags, is_published, published_at
) VALUES
(
    '0a000000-0000-4000-a000-000000000001',
    'welcome-to-the-template',
    'Welcome to the App Template',
    'A short tour of what ships in this template and how the blog is wired up.',
    E'# Welcome\n\nThis blog is DB-driven. Admins can create, edit, and publish posts from the **Admin → Blog** page.\n\n## What you get\n\n- Markdown-friendly body field (`post_body`)\n- Tag taxonomy via JSONB (`post_tags`)\n- Draft / publish workflow (`is_published` + `published_at`)\n- Slugs are unique and validated at the DB layer\n\nReplace this seeded content with your own posts.',
    'App Template',
    '["welcome","getting-started"]'::jsonb,
    true,
    NOW()
),
(
    '0a000000-0000-4000-a000-000000000002',
    'authoring-posts',
    'Authoring posts as an admin',
    'How drafting, publishing, and editing posts works in the admin UI.',
    E'# Authoring\n\nPosts are stored in the `blog_post` table. The admin form accepts:\n\n- **Title** and **slug** (URL fragment, lowercase a-z 0-9 and dashes only)\n- **Excerpt** (preview text on the index page)\n- **Body** (Markdown or plain text)\n- **Hero image URL** (optional)\n- **Tags** (free-form, comma-separated in the UI)\n- **Publish toggle** + **published-at** scheduling\n\nLeave **is_published** off to keep a post as a draft. Drafts are not returned by the public API.',
    'App Template',
    '["authoring","admin"]'::jsonb,
    true,
    NOW()
)
ON CONFLICT (pk_blog_post) DO NOTHING;

# Plugin Migration Notes

This harness ships with a Claude Code plugin manifest at `plugin.json` for forward compatibility. **Today the harness is distributed by `git clone` rather than as an installed plugin.** The manifest is documentation-only until the layout is converted.

## Why it's not yet a real plugin

The canonical Claude Code plugin layout puts skills/scripts/hooks at the **plugin root**:

```
claude-build-harness/
├── .claude-plugin/plugin.json
├── skills/<skill>/SKILL.md      ← here, not under .claude/
├── scripts/                     ← here, not under .claude/
├── hooks/hooks.json
└── README.md
```

This harness uses `.claude/skills/`, `.claude/scripts/`, `.claude/harness-hooks.json` instead (the `clone-and-use` template pattern). Claude Code auto-discovers skills under `.claude/skills/` regardless, so functionality is identical; only the distribution model differs.

## Skills bundled

If/when this becomes a real installable plugin, it bundles these 14 skills:

| Category | Skill |
|----------|-------|
| Lifecycle phases | phase1-requirements, phase2-planning, phase3-architecture, phase4-prototyping, phase5-development, phase6-user-testing, phase7-user-acceptance, phase8-deployment |
| General | build, sync-docs, blueteam, redteam, greenteam, style-guide |

## Migration steps (when ready to publish)

1. Move `.claude/skills/*` → `skills/*` at the harness root.
2. Move `.claude/scripts/*` → `scripts/*` at the harness root.
3. Move `.claude/harness-hooks.json` → `hooks/hooks.json` at the harness root.
4. Move `.claude/references/*` → `references/*` (or keep nested; references aren't a formal plugin convention).
5. Update every internal path reference:
   - In every `SKILL.md` file: `.claude/skills/...` → `skills/...`
   - In `CLAUDE.md`: skill index paths
   - In `harness.html` `harnessData`: methodology + template paths
6. Run `node .claude/scripts/check-harness-consistency.mjs` to confirm no drift.
7. Test installation in a clean Claude Code session: `claude --plugin /path/to/claude-build-harness/`.
8. Publish to your plugin registry of choice.

The clone-and-use model continues to work after this migration; the layout change is additive.

## Why defer

The clone-and-use pattern works well for the current scale (each user clones into their own working copy). Plugin distribution becomes valuable when:
- You want a single update that propagates to all installs without each user `git pull`-ing.
- You want versioned releases users can pin (`--plugin-version 2.0.0`).
- You're publishing to a public or organization-wide plugin registry.

Until one of those becomes a real need, the manifest sits here as forward-compatibility scaffolding.

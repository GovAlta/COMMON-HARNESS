---
title: "AI HTML Report Template"
description: HTML report generation template and Mermaid-to-SVG conversion rules. Read by any skill that writes .html report files. Not for standalone use.
version: 1.0.0
status: active
parent_skill: shared/schemas/artifacts.md
---

> Sub-file of `shared/schemas/artifacts.md`. Contains the HTML page template, CSS, Markdown→HTML conversion rules, and Mermaid→SVG conversion rules used when generating `.html` report files alongside `.md` files. Load this file (instead of the full `shared/schemas/artifacts.md`) when your skill only needs to produce HTML output.

---

## HTML Report Generation

Every `.md` file written to `.ai/blueteam/reports/` **MUST** have a corresponding `.html` file with the same basename. Both files are written in the same step: generating one without the other is an error.

### Naming Convention

| Markdown file | HTML file |
|---|---|
| `.ai/blueteam/reports/threat_model.md` | `.ai/blueteam/reports/threat_model.html` |
| `.ai/blueteam/reports/asvs_level2_security_assessment.md` | `.ai/blueteam/reports/asvs_level2_security_assessment.html` |
| `.ai/blueteam/reports/asvs_level2_full_coverage.md` | `.ai/blueteam/reports/asvs_level2_full_coverage.html` |
| `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md` | `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.html` |
| `.ai/blueteam/reports/security-classification.md` | `.ai/blueteam/reports/security-classification.html` |
| `.ai/blueteam/reports/security_requirements.md` | `.ai/blueteam/reports/security_requirements.html` |
| `.ai/blueteam/reports/code_changes.md` | `.ai/blueteam/reports/code_changes.html` |
| `.ai/blueteam/reports/security-test-coverage-report.md` | `.ai/blueteam/reports/security-test-coverage-report.html` |
| `.ai/blueteam/reports/application_map.md` | `.ai/blueteam/reports/application_map.html` |
| `.ai/blueteam/reports/cross_domain_kill_chains.md` | `.ai/blueteam/reports/cross_domain_kill_chains.html` |
| `.ai/blueteam/reports/dr_resilience_assessment.md` | `.ai/blueteam/reports/dr_resilience_assessment.html` |
| `.ai/blueteam/reports/security_overview.md` | `.ai/blueteam/reports/security_overview.html` |
| `.ai/blueteam/reports/security_unit_test_coverage.md` | `.ai/blueteam/reports/security_unit_test_coverage.html` |

### HTML Page Template

Use the following self-contained template for every HTML report. Replace the bracketed placeholders (see **Placeholder Values** below).

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[REPORT_TITLE]: Security Assessment</title>
  <style>
    :root {
      --brand-primary:#003366; --brand-primary-med:#005eb8; --brand-accent:#FFBA35;
      --critical:#c0392b; --high:#d35400; --medium:#c4960b; --low:#2471a3;
      --pass:#1e8449; --assumed:#6c757d;
      --border:#dee2e6; --bg-page:#f4f6f8; --bg-card:#ffffff; --text:#212529;
      --code-bg:#1e2733; --code-fg:#e8eaf0;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:14px;color:var(--text);background:var(--bg-page);line-height:1.6}
    .rpt-header{background:var(--brand-primary);color:#fff;padding:20px 40px;display:flex;justify-content:space-between;align-items:flex-end}
    .rpt-header .brand{font-size:12px;opacity:.75;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px}
    .rpt-header h1{font-size:22px;font-weight:600}
    .rpt-header .meta{text-align:right;font-size:12px;opacity:.85;line-height:1.8}
    .gold-bar{height:4px;background:var(--brand-accent)}
    .container{max-width:1100px;margin:28px auto;padding:0 20px}
    section{background:var(--bg-card);border-radius:6px;border:1px solid var(--border);padding:24px 28px;margin-bottom:18px}
    h2{font-size:17px;color:var(--brand-primary);border-bottom:2px solid var(--brand-primary);padding-bottom:6px;margin-bottom:16px}
    h3{font-size:15px;margin:18px 0 8px;font-weight:600;color:#222}
    h4{font-size:14px;margin:14px 0 6px;font-weight:600;color:#444}
    p{margin:8px 0}
    ul,ol{margin:8px 0 8px 24px}
    li{margin:3px 0}
    a{color:var(--brand-primary-med)}
    strong{font-weight:600}
    hr{border:none;border-top:1px solid var(--border);margin:16px 0}
    .badge{display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
    .badge-critical{background:var(--critical);color:#fff}
    .badge-high{background:var(--high);color:#fff}
    .badge-medium{background:var(--medium);color:#fff}
    .badge-low{background:var(--low);color:#fff}
    .badge-pass,.badge-compliant{background:var(--pass);color:#fff}
    .badge-assumed{background:var(--assumed);color:#fff}
    table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
    th{background:var(--brand-primary);color:#fff;padding:8px 12px;text-align:left;font-weight:600}
    td{padding:7px 12px;border-bottom:1px solid var(--border);vertical-align:top}
    tr:nth-child(even) td{background:#f8f9fa}
    tr:hover td{background:#eef3fb}
    pre{background:var(--code-bg);color:var(--code-fg);border-radius:5px;padding:14px 16px;overflow-x:auto;font-family:"Cascadia Code","Fira Code","Consolas",monospace;font-size:12.5px;line-height:1.5;margin:10px 0}
    code{background:#e9ecef;color:#b03060;padding:1px 5px;border-radius:3px;font-family:"Cascadia Code","Fira Code","Consolas",monospace;font-size:12.5px}
    pre code{background:none;color:inherit;padding:0}
    blockquote{border-left:4px solid var(--brand-primary);background:#f0f4fb;padding:10px 16px;margin:10px 0;border-radius:0 4px 4px 0}
    blockquote p{margin:0}
    .task-list{list-style:none;padding-left:0}
    .task-list li{padding-left:26px;position:relative;margin:4px 0}
    .task-list li::before{content:"☐";position:absolute;left:2px;font-size:15px;line-height:1.4}
    .task-list li.checked::before{content:"☑";color:var(--pass)}
    .finding-card{border-left:5px solid var(--border);padding:14px 18px;margin:16px 0;border-radius:0 4px 4px 0;background:#fdfdfd}
    .finding-card.critical{border-color:var(--critical)}
    .finding-card.high{border-color:var(--high)}
    .finding-card.medium{border-color:var(--medium)}
    .finding-card.low{border-color:var(--low)}
    /* ── Status Banners ── */
    .status-banner{border-radius:8px;padding:18px 22px;margin-bottom:20px;display:flex;align-items:flex-start;gap:16px}
    .status-banner .sb-icon{font-size:32px;line-height:1;flex-shrink:0;margin-top:2px}
    .status-banner .sb-body{flex:1}
    .status-banner .sb-title{font-size:17px;font-weight:700;margin-bottom:4px}
    .status-banner .sb-detail{font-size:13px;line-height:1.5}
    .status-banner .sb-action{font-size:12px;margin-top:8px}
    .sb-critical{background:#fdf1f1;border:2px solid var(--critical)}
    .sb-critical .sb-icon,.sb-critical .sb-title{color:var(--critical)}
    .sb-critical .sb-detail{color:#721c24}
    .sb-high{background:#fff4ee;border:2px solid var(--high)}
    .sb-high .sb-icon,.sb-high .sb-title{color:var(--high)}
    .sb-high .sb-detail{color:#7c2d12}
    .sb-medium{background:#fffbeb;border:2px solid var(--medium)}
    .sb-medium .sb-icon,.sb-medium .sb-title{color:#92400e}
    .sb-medium .sb-detail{color:#78350f}
    .sb-pass{background:#d4edda;border:2px solid var(--pass)}
    .sb-pass .sb-icon,.sb-pass .sb-title{color:var(--pass)}
    .sb-pass .sb-detail{color:#155724}
    .sb-info{background:#f8f9fa;border:2px solid var(--assumed)}
    .sb-info .sb-icon,.sb-info .sb-title{color:var(--assumed)}
    .sb-info .sb-detail{color:#555}
    /* ── Scope Callout (top of every individual report) ── */
    .scope-callout{background:#fff8e1;border:1px solid #e6ab00;border-left:4px solid #e6ab00;border-radius:4px;padding:10px 16px;margin:0 0 18px;font-size:12px;color:#4a3200;line-height:1.5}
    .scope-callout strong{color:#3d2600}
    .diagram-container{margin:16px 0}
    .diagram-container svg{display:block;margin:0 auto;max-width:100%;height:auto;overflow:visible}
    .diagram-source{margin-top:6px}
    .diagram-source summary{font-size:11px;color:#6c757d;cursor:pointer;user-select:none;padding:2px 4px}
    .diagram-source summary:hover{color:var(--brand-primary)}
    .diagram-source pre{margin-top:4px;font-size:11px}
    .rpt-footer{text-align:center;font-size:11px;color:#6c757d;padding:18px 40px;border-top:1px solid var(--border);background:#f4f6f8;margin-top:10px}
    @media print{
      body{background:#fff;font-size:11px}
      .rpt-header,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      section{break-inside:avoid;border:none;padding:12px 0}
      .gold-bar{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    }
    @media(max-width:768px){
      .rpt-header{flex-direction:column;gap:10px}
      .rpt-header .meta{text-align:left}
      .container{padding:0 12px}
    }
  </style>
</head>
<body>
<div class="rpt-header">
  <div>
    <div class="brand">Security Assessment Framework</div>
    <h1>[REPORT_TITLE]</h1>
  </div>
  <div class="meta">
    <div>[APPLICATION_NAME]</div>
    <div>Generated: [YYYY-MM-DD]</div>
    <div>[CLASSIFICATION_LABEL]</div>
  </div>
</div>
<div class="gold-bar"></div>
<div class="container">
<div class="scope-callout">&#9432; <strong>Code Review Scope</strong> &mdash; Findings are based on static analysis of source code / configuration / documentation. Environmental controls (WAF, network firewall, IdP-level authentication, endpoint protection, storage encryption) are partially assumed per the organizational Environment Baseline but not independently verified. See the <strong>Environment Assumptions</strong> section for every assumption applied. Some findings may already be mitigated by controls not visible in this review &mdash; confirm with your operations or security team.</div>
[REPORT_BODY]
</div>
<div class="rpt-footer">
  organizational &mdash; Cybersecurity Assessment &nbsp;|&nbsp; Generated: [YYYY-MM-DD] &nbsp;|&nbsp; [CLASSIFICATION_LABEL]
</div>
</body>
</html>
```

### Placeholder Values

| Placeholder | Source |
|---|---|
| `[REPORT_TITLE]` | The H1 heading (`# …`) of the Markdown document |
| `[APPLICATION_NAME]` | The application name from the report's Assessment Summary or metadata; use `-` if absent |
| `[YYYY-MM-DD]` | The same date written to the `.md` file |
| `[CLASSIFICATION_LABEL]` | Security classification stated in the report (e.g., `PROTECTED B`); default to `OFFICIAL` if not stated |
| `[REPORT_BODY]` | The converted Markdown body: see Conversion Rules below |

### Markdown → HTML Conversion Rules

**Document structure:**
- The H1 (`# Title`) becomes `[REPORT_TITLE]` in the page header: do NOT repeat it as `<h1>` in the body.
- Each H2 (`## Section Name`) opens a new `<section>` block; close the previous `<section>` first. The H2 text becomes `<h2>Section Name</h2>` inside the new section. Close the final section before `</div>`.
- H3 → `<h3>`, H4 → `<h4>`.

**Inline elements:**
- `**bold**` → `<strong>bold</strong>`
- `*italic*` → `<em>italic</em>`
- `` `inline code` `` → `<code>inline code</code>`
- `[text](url)` → `<a href="url">text</a>`

**Code blocks:**
- Fenced code (`` ```lang … ``` ``) → `<pre><code class="language-lang">…</code></pre>`
- Mermaid blocks (`` ```mermaid … ``` ``) → Generate an inline SVG using the **Mermaid → SVG Conversion** rules in the section below. Wrap the result in `<figure class="diagram-container">` with a `<details class="diagram-source">` fallback. Do **not** use `<div class="mermaid">` or load any external script: reports must render without internet access.

**Tables:**
- First row → `<thead><tr><th>…</th></tr></thead>`; remaining rows → `<tbody><tr><td>…</td></tr></tbody>`.
- In any table cell or `**Severity:**` / `**Priority:**` / `**Overall Risk Rating:**` label value, wrap the keyword in a badge span:
  - `Critical` → `<span class="badge badge-critical">Critical</span>`
  - `High` → `<span class="badge badge-high">High</span>`
  - `Medium` → `<span class="badge badge-medium">Medium</span>`
  - `Low` → `<span class="badge badge-low">Low</span>`
- Compliance verdict keywords: `COMPLIANT` → `<span class="badge badge-pass">Compliant</span>`, `NON-COMPLIANT` → `<span class="badge badge-critical">Non-Compliant</span>`, `ASSUMED COMPLIANT` → `<span class="badge badge-assumed">Assumed Compliant</span>`, `NOT VERIFIABLE` → `<span class="badge badge-assumed">Not Verifiable</span>`.

**Lists:**
- `- item` / `* item` → `<ul><li>…</li></ul>`
- `1. item` → `<ol><li>…</li></ol>`
- `- [ ] item` → `<ul class="task-list"><li>[ ] item</li></ul>`
- `- [x] item` → `<ul class="task-list"><li class="checked">[x] item</li></ul>`

**Blockquotes:**
- `> text` → `<blockquote><p>text</p></blockquote>`

**Finding / Kill Chain cards:**
- Finding headings (`### FINDING-NNN: Title`, `### CAS-RULE`, `### KC-NNN`) should be wrapped in `<div class="finding-card [severity]">…</div>` where `[severity]` is `critical`, `high`, `medium`, or `low` derived from the **Severity:** or **Priority:** field inside the finding. Close `</div>` before the next same-level heading.
- **CRITICAL nesting rule:** The closing `</div>` for a finding-card MUST appear **before** the enclosing `</section>` tag. Never place `</div>` after `</section>`. When the last finding in a section is followed by a new H2 section, the correct order is: `</div></section><section><h2>…</h2><div class="finding-card …">`. Placing `</div>` after `</section>` causes the HTML5 parser to auto-close the finding-card div at the section boundary; the orphaned `</div>` then prematurely closes the nearest open `<div>` ancestor (typically the page layout container). This breaks the entire page layout.

**Horizontal rules:**
- `---` → `<hr>` (only when not already handled by the H2 section boundary logic).

**Paragraphs:**
- Plain text lines → `<p>…</p>`

---

### Mermaid → SVG Conversion

Generate hand-rendered inline SVG for every ` ```mermaid ``` ` block. Reports must be self-contained and display correctly in MS Edge without internet access. Never use `<div class="mermaid">` or load `mermaid.min.js`.

#### Supported diagram types

| Diagram type | Treatment |
|---|---|
| `flowchart TD` / `graph TD` (top-down) | Full SVG: §§ 1-7 below |
| `flowchart LR` / `graph LR` (left-right) | Full SVG: same rules, axes swapped |
| `sequenceDiagram` | Simplified SVG: § 8 below |
| `erDiagram`, C4, Gantt, pie, etc. | Styled fallback box: § 9 below |

#### § 1: Parse the Mermaid source

**Nodes**: each definition assigns an `id`, optional `label`, and `shape`:

| Pattern | Shape |
|---|---|
| `id` or `id[label]` | Rectangle (default: system component / process) |
| `id(label)` or `id([label])` | Rounded-corner rectangle |
| `id[(label)]` | Cylinder (data store) |
| `id{label}` or `id{{label}}` | Diamond (decision / gateway) |
| `id((label))` | Circle (external entity / actor) |
| `id[[label]]` | Double-rect (sub-process) |
| `id>label]` | Asymmetric banner (event / note) |

If a node id appears only in edge definitions (no explicit shape declaration), treat it as a Rectangle. Strip Markdown formatting from labels; replace `<br>` or `<br/>` with a newline for multi-line wrapping.

**Edges**: extract from lines matching `A --> B`, `A -- label --> B`, `A -. label .-> B`, `A ==> B`, `A -- label --- B`:

| Arrow syntax | Rendering |
|---|---|
| `-->` | Solid arrow (`marker-end="url(#arr)"`) |
| `-.->` | Dashed stroke (`stroke-dasharray="6,3"`) + dim arrowhead (`url(#arr-dim)`) |
| `==>` | Thick stroke (`stroke-width:3`) + thick arrowhead (`url(#arr-thick)`) |
| `---` or `---label---` | Line, no arrowhead |

**Subgraphs**: `subgraph Title … end`: collect enclosed node ids and title for trust-boundary box rendering.

**Style overrides**: `style id fill:#hex,stroke:#hex`: capture per-node fill/stroke to override defaults.

#### § 2: Layout algorithm

**Constants:** `NODE_W = 160`, `NODE_H = 44`, `H_GAP = 64`, `V_GAP = 60`, `TOP_MARGIN = 24`, `LEFT_MARGIN = 40`

**Rank assignment (BFS):**
1. Source nodes (no incoming edges) = rank 0.
2. Each other node's rank = max(predecessor ranks) + 1.
3. Assign columns left-to-right within each rank, in order of first appearance in the source.

**Position (TD: top-down):**
- `node_cx = LEFT_MARGIN + col × (NODE_W + H_GAP) + NODE_W / 2`
- `node_cy = TOP_MARGIN + rank × (NODE_H + V_GAP) + NODE_H / 2`

**LR diagrams:** Swap axes: rank controls x, column controls y; swap `H_GAP` / `V_GAP` in the formula.

**Multi-line labels:** Add `14 × extra_lines` px to that node's height; shift all lower-rank nodes down by the same amount.

#### § 3: Node rendering

Use `cx, cy` as the node center. Let `w = NODE_W`, `h = actual node height (NODE_H + any multi-line expansion)`, `x = cx - w/2`, `y = cy - h/2`.

**Rectangle (default):**
```
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4"
      fill="#dce8f7" stroke="#003366" stroke-width="1.5"/>
```

**Rounded-corner rectangle:**
```
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}"
      fill="#dce8f7" stroke="#003366" stroke-width="1.5"/>
```

**Cylinder (data store): use w=140:**
```
<!-- body rect (clip top curve) -->
<rect x="{cx-70}" y="{cy-h/2+9}" width="140" height="{h-9}" fill="#ffffff" stroke="#003366" stroke-width="1.5"/>
<!-- top ellipse (drawn over body top edge) -->
<ellipse cx="{cx}" cy="{cy-h/2+9}" rx="70" ry="9" fill="#f0f4fb" stroke="#003366" stroke-width="1.5"/>
<!-- bottom ellipse (drawn over body bottom edge) -->
<ellipse cx="{cx}" cy="{cy+h/2}" rx="70" ry="9" fill="#ffffff" stroke="#003366" stroke-width="1.5"/>
```

**Diamond:**
```
<polygon points="{cx},{cy-h/2} {cx+w/2},{cy} {cx},{cy+h/2} {cx-w/2},{cy}"
         fill="#fffbeb" stroke="#c4960b" stroke-width="1.5"/>
```

**Circle (external entity / actor):**
```
<circle cx="{cx}" cy="{cy}" r="30" fill="#f0f4fb" stroke="#6c757d" stroke-width="1.5"/>
```

**Double-rect (sub-process):**
```
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="#dce8f7" stroke="#003366" stroke-width="1.5"/>
<rect x="{x+4}" y="{y+4}" width="{w-8}" height="{h-8}" rx="1" fill="none" stroke="#003366" stroke-width="1"/>
```

**Node label**: centered; wrap at word boundaries ≤ 22 chars/line; vertically center multi-line text by offsetting first tspan up by `(n_lines - 1) × 7` from `cy`:
```
<text x="{cx}" y="{cy - (n_lines-1)*7}"
      text-anchor="middle" dominant-baseline="middle"
      font-family="'Segoe UI',system-ui,Arial,sans-serif" font-size="12" fill="#003366">
  <tspan x="{cx}" dy="0">{line 1}</tspan>
  <tspan x="{cx}" dy="14">{line 2 if present}</tspan>
</text>
```

Apply per-node `style` overrides to `fill` and `stroke` of the shape element.

#### § 4: Edge rendering

**Anchor points (TD):**
- Source exits from bottom center: `(S.cx, S.cy + S.h/2)`
- Target enters from top center: `(T.cx, T.cy - T.h/2)`

**Anchor points (LR):**
- Source exits from right center: `(S.cx + S.w/2, S.cy)`
- Target enters from left center: `(T.cx - T.w/2, T.cy)`

**Path selection:**
- Adjacent ranks, same column → straight `<line>`
- Normal forward edge → elbow: `M sx,sy L sx,my L tx,my L tx,ty` where `my = (sy + ty) / 2`
- Same-rank (sibling) edge → gentle arc: `M sx,sy C sx,{sy-45} tx,{ty-45} tx,ty`
- Back-edge (target rank ≤ source rank) → route left of diagram: `M sx,sy L {bx},sy L {bx},ty L tx,ty` where `bx = LEFT_MARGIN/2 - edge_index × 14`

Shorten the path's final segment by 7px in the edge direction so arrowheads don't overlap node borders.

**Edge label**: at `((sx+tx)/2, my-6)`, `font-size="11"`, `fill="#555"`, `text-anchor="middle"`. Add a white background rect behind the label:
```
<rect x="{lx - len*3.2 - 3}" y="{ly-11}" width="{len*6.4+6}" height="14" fill="white" opacity="0.85"/>
<text x="{lx}" y="{ly}" text-anchor="middle" font-size="11" fill="#555">{label}</text>
```
(where `len = label.length`)

#### § 5: Arrowhead markers

Always include in `<defs>` (use `userSpaceOnUse` so size is consistent regardless of stroke-width):
```
<defs>
  <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3"
          orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L0,6 L8,3 z" fill="#003366"/>
  </marker>
  <marker id="arr-dim" markerWidth="8" markerHeight="6" refX="7" refY="3"
          orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L0,6 L8,3 z" fill="#6c757d"/>
  </marker>
  <marker id="arr-thick" markerWidth="10" markerHeight="8" refX="9" refY="4"
          orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L0,8 L10,4 z" fill="#003366"/>
  </marker>
</defs>
```

#### § 6: Subgraph / trust boundary rendering

Compute bounding box over all enclosed nodes; render **before** (behind) nodes:
```
bx = min(node left edges) - 12
by = min(node top edges) - 28
bw = max(node right edges) - bx + 12
bh = max(node bottom edges) - by + 12

<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="6"
      fill="none" stroke="#c0392b" stroke-width="1" stroke-dasharray="6,3" opacity="0.7"/>
<rect x="{bx+6}" y="{by-8}" width="{title_char_count * 7 + 10}" height="16" fill="#ffffff"/>
<text x="{bx+10}" y="{by+2}" font-size="11" fill="#c0392b" font-style="italic">{Title}</text>
```

#### § 7: SVG dimensions and output wrapper

```
total_cols = max number of nodes sharing one rank
total_ranks = max rank + 1
svg_w = max(LEFT_MARGIN + col_count × (NODE_W + H_GAP) + LEFT_MARGIN, 400)
svg_h = max(TOP_MARGIN + total_ranks × (NODE_H + V_GAP) + TOP_MARGIN, 200)
```

Final output:
```html
<figure class="diagram-container">
  <svg viewBox="0 0 {svg_w} {svg_h}" width="{svg_w}"
       style="max-width:100%;height:auto"
       xmlns="http://www.w3.org/2000/svg"
       role="img" aria-label="{diagram label: first defined node label or diagram type}">
    <defs>…arrowhead markers…</defs>
    <!-- subgraph backgrounds -->
    <!-- edges (drawn before nodes so node shapes overlay edge lines) -->
    <!-- nodes -->
  </svg>
  <details class="diagram-source">
    <summary>Diagram source (Mermaid)</summary>
    <pre><code>{original mermaid source verbatim}</code></pre>
  </details>
</figure>
```

#### § 8: Sequence diagrams

Parse `sequenceDiagram` blocks:
1. Extract participants in order of first appearance. Set `PART_GAP = 180`, header box `140 × 36`.
2. Place participant headers at `y = 16`; lifeline x-centers: `60 + i × PART_GAP`.
3. Draw vertical dashed lifelines starting at `y = 52` and ending at the bottom of the diagram (`stroke="#aaa" stroke-dasharray="4,3"`).
4. For each message (`A ->> B: label`, `A -->> B: label`, `A -x B: label`): place at increasing y starting at `y = 60 + 36` with `MSG_STEP = 44`.
   - Solid arrow (`->>`) → `stroke="#003366"` + arrowhead `url(#arr)`
   - Dashed reply (`-->>`) → `stroke="#6c757d" stroke-dasharray="4,2"` + `url(#arr-dim)`
   - Cross (`-x`) → draw an × mark at target instead of arrowhead
   - Place edge label above the midpoint; use white background rect behind it.
5. `activate/deactivate` → draw a `12 × activation_height` rect on the lifeline, `fill="#dce8f7" stroke="#003366"`.
6. `loop/alt/opt/par` blocks → dashed outline rect with block label at top-left; `stroke="#0066cc" stroke-dasharray="5,3"`.
7. SVG: `w = 60 + num_participants × PART_GAP`, `h = 52 + num_messages × MSG_STEP + 40`.
8. Participant header boxes: `fill="#dce8f7" stroke="#003366"`, label centered, `font-size="12"`.

#### § 9: Unsupported diagram types (ER, C4, Gantt, pie, etc.)

```html
<figure class="diagram-container">
  <div style="border:2px dashed #6c757d;border-radius:6px;padding:16px 20px;
              background:#f8f9fa;font-size:13px;color:#555">
    <strong style="color:#003366">[Diagram type: e.g., Entity-Relationship Diagram]</strong>
    <p style="margin-top:8px">This diagram type requires a Mermaid-compatible viewer.</p>
  </div>
  <details class="diagram-source">
    <summary>Diagram source (Mermaid)</summary>
    <pre><code>{original mermaid source verbatim}</code></pre>
  </details>
</figure>
```

/**
 * Mock data for template demonstration.
 * TODO: Replace with real API calls via @/lib/api when connecting to a backend.
 * See CLAUDE.md "Adapting the Template" section for migration instructions.
 */

export interface BlogPost {
  id: number;
  slug: string;
  title: string;
  date: string;
  author: string;
  category: string;
  excerpt: string;
  content: string;
  featured: boolean;
}

export const blogPosts: BlogPost[] = [
  {
    id: 1,
    slug: 'building-real-time-analytics-dashboards',
    title: 'Building Real-Time Analytics Dashboards That Scale',
    date: '2026-03-10',
    author: 'Jordan Lee',
    category: 'Analytics',
    excerpt:
      'A practical guide to designing analytics dashboards that handle millions of events per day without sacrificing query performance or user experience.',
    content: `Real-time analytics dashboards are the backbone of modern SaaS products, but building them at scale introduces challenges that are easy to underestimate. The difference between a dashboard that loads in 200 milliseconds and one that takes 8 seconds often comes down to architectural decisions made early in the design process.

The first principle is to separate your read and write paths. Ingesting raw events into an append-only store (such as a time-series database or columnar warehouse) and then materializing pre-aggregated views for dashboard queries eliminates the contention that cripples single-database architectures. Tools like Apache Kafka for event streaming, combined with ClickHouse or Apache Druid for analytical queries, have become a reliable pattern. For smaller deployments, PostgreSQL with materialized views and proper partitioning can handle more than most teams expect.

The second principle is progressive disclosure in the UI. Not every chart needs to load simultaneously. Lazy-loading panels as users scroll, caching recent query results at the API layer, and providing sensible default time ranges (last 7 days instead of all time) dramatically improve perceived performance. When you combine server-side pre-aggregation with client-side caching and smart defaults, dashboards that once felt sluggish become genuinely responsive, even across millions of underlying records.`,
    featured: true,
  },
  {
    id: 2,
    slug: 'designing-developer-friendly-rest-apis',
    title: 'Designing Developer-Friendly REST APIs',
    date: '2026-02-22',
    author: 'Morgan Chen',
    category: 'API Design',
    excerpt:
      'Lessons learned from building APIs consumed by hundreds of integration partners, covering versioning, pagination, error handling, and documentation.',
    content: `A well-designed API is the most important product a platform company ships. It outlasts any individual UI, gets embedded in customer workflows, and its mistakes are nearly impossible to reverse once partners depend on them. After building and iterating on APIs consumed by hundreds of integration partners, a few principles stand out as non-negotiable.

First, invest in consistent conventions from day one. Every endpoint should follow the same patterns for pagination (offset-based with clear total counts), filtering (query parameters with predictable naming), sorting, and error responses. Use a single error envelope format with a machine-readable code, a human-readable message, and a documentation URL. When developers learn one endpoint, they should intuitively know how every other endpoint behaves. Version your API in the URL path (such as /api/v1/) rather than in headers; it makes debugging, logging, and partner communication simpler.

Second, treat your API documentation as a product, not an afterthought. Auto-generated OpenAPI specs are a starting point, not a finish line. Every endpoint needs a clear description of what it does, realistic example requests and responses, and explicit documentation of edge cases (what happens when a filter returns zero results, or when a referenced resource has been deleted). Interactive documentation that lets developers make test calls without leaving the browser reduces integration time from days to hours and prevents the majority of support tickets.`,
    featured: false,
  },
  {
    id: 3,
    slug: 'security-best-practices-for-saas-platforms',
    title: 'Security Best Practices for SaaS Platforms',
    date: '2026-02-08',
    author: 'Taylor Park',
    category: 'Security',
    excerpt:
      'Essential security practices for SaaS applications, from authentication and authorization to data encryption, audit logging, and incident response.',
    content: `Security in SaaS is not a feature you ship once; it is a continuous practice that touches every layer of the stack. Customers trust you with their data, and a single breach can destroy years of relationship-building. The following practices are not aspirational -- they are the minimum bar for any production SaaS platform.

Authentication must go beyond passwords. Implement multi-factor authentication as a default, not an opt-in. Use short-lived JWT tokens (15 minutes or less) paired with secure, HTTP-only refresh tokens. Enforce password complexity and check credentials against known breach databases on sign-up and password change. For API access, issue scoped API keys with explicit permission sets, and provide mechanisms for customers to rotate keys without downtime. Rate-limit authentication endpoints aggressively to mitigate brute-force attacks.

On the data side, encrypt everything at rest and in transit. Use TLS 1.3 for all connections, encrypt database volumes with AES-256, and consider field-level encryption for particularly sensitive columns like personal identifiers or financial data. Maintain comprehensive audit logs that record who accessed what, when, and from where. These logs should be immutable and retained for at least 12 months. Finally, have a documented incident response plan that your team has actually rehearsed. When (not if) something goes wrong, the speed and transparency of your response determines whether customers stay or leave.`,
    featured: true,
  },
  {
    id: 4,
    slug: 'scaling-from-startup-to-enterprise',
    title: 'Scaling Your SaaS Architecture from Startup to Enterprise',
    date: '2026-01-15',
    author: 'Alex Rivera',
    category: 'Scaling',
    excerpt:
      'How to evolve your architecture from a monolith serving 100 users to a distributed system handling enterprise workloads, without rewriting everything.',
    content: `Every successful SaaS product faces the same inflection point: the architecture that got you to your first 100 customers cannot support your next 10,000. The temptation is to rewrite everything as microservices, but the most successful teams evolve incrementally, extracting services only when the pain of the monolith becomes concrete and measurable.

Start by identifying your hotspots. Profile your application to find the 2-3 components that consume the most resources or create the most contention. Typically these are background job processing (reports, exports, notifications), search and filtering across large datasets, and file or media handling. Extract these into standalone services with clear API contracts and independent scaling characteristics. Keep the rest of the monolith intact. A well-structured monolith with clear module boundaries is far easier to maintain than a poorly structured microservices architecture with distributed spaghetti.

Database scaling follows a similar incremental pattern. Start with read replicas to offload reporting and analytics queries. Add connection pooling (PgBouncer for PostgreSQL) to handle connection spikes. Implement table partitioning for your largest tables before you consider sharding. When you do need to shard, do it at the tenant level so each customer's data stays together, which simplifies queries and makes compliance (data residency, right-to-delete) dramatically easier. The key insight is that you do not need to solve every scaling problem today. You need to make decisions that do not close off future options.`,
    featured: false,
  },
  {
    id: 5,
    slug: 'accessibility-in-data-heavy-applications',
    title: 'Making Data-Heavy Applications Accessible',
    date: '2025-12-20',
    author: 'Sam Nakamura',
    category: 'Accessibility',
    excerpt:
      'Practical strategies for making dashboards, data tables, and charts accessible to users with disabilities, including screen reader support and keyboard navigation.',
    content: `Data visualization tools are among the least accessible categories of web applications, and that is a problem worth solving. Approximately 15% of the global population lives with some form of disability, and accessibility is not only an ethical obligation but increasingly a legal one. The good news is that making data-rich applications accessible does not require sacrificing functionality or visual design.

For data tables, the foundation is semantic HTML. Use proper table, thead, tbody, th, and td elements rather than div-based grid layouts. Add scope attributes to header cells, provide caption elements that describe what the table contains, and implement aria-sort attributes on sortable columns. For large tables with pagination, announce page changes to screen readers using aria-live regions. Keyboard navigation should allow users to move between cells with arrow keys, and sortable column headers should be focusable and operable with Enter or Space.

Charts present the biggest accessibility challenge because they are inherently visual. The most effective approach is to provide multiple representations of the same data. Include a visually hidden data table as an alternative to every chart. Use aria-label on chart containers to provide a text summary of the trend (for example, "Revenue increased 23% from January to December 2025"). For interactive charts, ensure that tooltips are keyboard-accessible and that focus indicators are visible. Choose color palettes that maintain sufficient contrast in grayscale and for common forms of color blindness -- tools like the Viz Palette simulator make this straightforward. These practices benefit all users, not just those with disabilities, by providing more ways to understand and interact with data.`,
    featured: true,
  },
];

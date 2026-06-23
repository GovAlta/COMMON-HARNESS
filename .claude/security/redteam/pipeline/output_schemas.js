/**
 * Output format schemas for structured agent responses.
 *
 * Each schema is a JSON Schema object consumed by the Claude Agent SDK's
 * `outputFormat` parameter.  Only agents that return structured JSON
 * (as opposed to free-form Markdown) need an entry here.
 */

export const code_analysis_output_schema = {
    type: 'object',
    properties: {
        executive_summary: {
            type: 'string',
        },
        technology_stack: {
            type: 'object',
            properties: {
                languages: { type: 'array', items: { type: 'string' } },
                frameworks: { type: 'array', items: { type: 'string' } },
                architectural_pattern: { type: 'string' },
                critical_security_components: { type: 'array', items: { type: 'string' } },
            },
            required: ['languages', 'frameworks'],
        },
        authentication: {
            type: 'object',
            properties: {
                mechanisms: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'e.g. JWT, OAuth2, session cookies',
                },
                auth_endpoints: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Login, logout, refresh, password reset endpoints',
                },
                session_config_location: {
                    type: 'string',
                    description: 'File and line where session/cookie flags are configured',
                },
                analysis: { type: 'string' },
            },
            required: ['mechanisms', 'auth_endpoints', 'analysis'],
        },
        data_security: { type: 'string' },
        attack_surface: {
            type: 'object',
            properties: {
                entry_points: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            path: { type: 'string' },
                            method: { type: 'string' },
                            auth_required: { type: 'boolean' },
                            risk_level: {
                                type: 'string',
                                enum: ['critical', 'high', 'medium', 'low', 'info'],
                            },
                            notes: { type: 'string' },
                        },
                        required: ['path', 'auth_required', 'risk_level'],
                    },
                },
                unauthenticated_endpoints: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            path: { type: 'string' },
                            method: { type: 'string' },
                            privileged_operation: { type: 'string' },
                            credentials_used: { type: 'string' },
                            abuse_scenarios: { type: 'array', items: { type: 'string' } },
                        },
                        required: ['path', 'privileged_operation', 'abuse_scenarios'],
                    },
                },
            },
            required: ['entry_points', 'unauthenticated_endpoints'],
        },
        infrastructure_security: { type: 'string' },
        codebase_overview: { type: 'string' },
        critical_file_paths: {
            type: 'object',
            properties: {
                configuration:               { type: 'array', items: { type: 'string' } },
                authentication_authorization: { type: 'array', items: { type: 'string' } },
                api_routing:                 { type: 'array', items: { type: 'string' } },
                data_models_db:              { type: 'array', items: { type: 'string' } },
                dependency_manifests:        { type: 'array', items: { type: 'string' } },
                sensitive_data_secrets:      { type: 'array', items: { type: 'string' } },
                middleware_validation:        { type: 'array', items: { type: 'string' } },
                logging_monitoring:          { type: 'array', items: { type: 'string' } },
                infrastructure_deployment:   { type: 'array', items: { type: 'string' } },
            },
            required: [
                'configuration',
                'authentication_authorization',
                'api_routing',
                'dependency_manifests',
            ],
        },
        xss_sinks: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    file_path:   { type: 'string' },
                    line_number: { type: 'integer' },
                    sink_type:   { type: 'string' },
                    context: {
                        type: 'string',
                        enum: ['html_body', 'html_attribute', 'javascript', 'css', 'url'],
                    },
                    description: { type: 'string' },
                },
                required: ['file_path', 'sink_type', 'context'],
            },
        },
        ssrf_sinks: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    file_path:   { type: 'string' },
                    line_number: { type: 'integer' },
                    category: {
                        type: 'string',
                        enum: [
                            'http_client', 'raw_socket', 'url_opener',
                            'redirect_handler', 'headless_browser', 'media_processor',
                            'link_unfurler', 'webhook', 'sso_oidc', 'importer',
                            'package_installer', 'monitoring', 'cloud_metadata', 'other',
                        ],
                    },
                    description: { type: 'string' },
                },
                required: ['file_path', 'category'],
            },
        },
    },
    required: [
        'executive_summary',
        'technology_stack',
        'authentication',
        'attack_surface',
        'critical_file_paths',
        'xss_sinks',
        'ssrf_sinks',
    ],
};

export const recommendation_output_schema = {
    type: 'object',
    properties: {
        remediation_report: {
            type: 'object',
            properties: {
                metadata: {
                    type: 'object',
                    properties: {
                        source_poc_report: { type: 'string' },
                        generated: { type: 'string' },
                        total_entries: { type: 'integer' },
                        severity_breakdown: {
                            type: 'object',
                            properties: {
                                critical: { type: 'integer' },
                                high:     { type: 'integer' },
                                medium:   { type: 'integer' },
                                low:      { type: 'integer' },
                            },
                            required: ['critical', 'high', 'medium', 'low'],
                        },
                    },
                    required: ['source_poc_report', 'generated', 'total_entries', 'severity_breakdown'],
                },
                priority_implementation_order: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            rem_id:               { type: 'string' },
                            rationale:            { type: 'string' },
                            deploy_together_with: { type: 'array', items: { type: 'string' } },
                        },
                        required: ['rem_id', 'rationale', 'deploy_together_with'],
                    },
                },
                remediation_entries: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            rem_id:          { type: 'string' },
                            title:           { type: 'string' },
                            severity: {
                                type: 'string',
                                enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
                            },
                            related_poc_ids: { type: 'array', items: { type: 'string' } },
                            quick_win:       { type: 'boolean' },
                            verified:        { type: 'boolean' },
                            root_cause:      { type: 'string' },
                            affected_files: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        file_path: { type: 'string' },
                                        lines:     { type: 'string' },
                                        role: {
                                            type: 'string',
                                            enum: ['source', 'sink', 'config', 'migration', 'shared', 'test'],
                                        },
                                    },
                                    required: ['file_path', 'role'],
                                },
                            },
                            recommended_changes: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        file_path:        { type: 'string' },
                                        line_start:       { type: 'integer' },
                                        line_end:         { type: 'integer' },
                                        language:         { type: 'string' },
                                        current_code:     { type: 'string' },
                                        replacement_code: { type: 'string' },
                                        explanation:      { type: 'string' },
                                    },
                                    required: ['file_path', 'current_code', 'replacement_code', 'explanation'],
                                },
                            },
                            verification_steps: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        step:            { type: 'integer' },
                                        type: {
                                            type: 'string',
                                            enum: ['positive', 'negative'],
                                        },
                                        description:     { type: 'string' },
                                        command:         { type: 'string' },
                                        expected_result: { type: 'string' },
                                    },
                                    required: ['step', 'type', 'description', 'expected_result'],
                                },
                            },
                            impact_assessment: {
                                type: 'object',
                                properties: {
                                    attack_chains_broken: { type: 'array', items: { type: 'string' } },
                                    functional_impact:    { type: 'string' },
                                    rollback_risk: {
                                        type: 'string',
                                        enum: ['low', 'medium', 'high'],
                                    },
                                    dependencies: { type: 'array', items: { type: 'string' } },
                                },
                                required: ['attack_chains_broken', 'functional_impact', 'rollback_risk', 'dependencies'],
                            },
                        },
                        required: [
                            'rem_id', 'title', 'severity', 'related_poc_ids',
                            'quick_win', 'verified', 'root_cause',
                            'affected_files', 'recommended_changes',
                            'verification_steps', 'impact_assessment',
                        ],
                    },
                },
                attack_chain_coverage_matrix: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            attack_chain:    { type: 'string' },
                            broken_by:       { type: 'array', items: { type: 'string' } },
                            fully_mitigated: { type: 'boolean' },
                            gaps:            { type: ['string', 'null'] },
                        },
                        required: ['attack_chain', 'broken_by', 'fully_mitigated', 'gaps'],
                    },
                },
            },
            required: [
                'metadata',
                'priority_implementation_order',
                'remediation_entries',
                'attack_chain_coverage_matrix',
            ],
        },
    },
    required: ['remediation_report'],
};

export const poc_output_schema = {
    type: 'object',
    properties: {
        poc_report: {
            type: 'object',
            properties: {
                metadata: {
                    type: 'object',
                    properties: {
                        target:   { type: 'string' },
                        run_id:   { type: 'string' },
                        date:     { type: 'string' },
                        assessor: { type: 'string' },
                    },
                    required: ['target', 'run_id', 'date', 'assessor'],
                },
                executive_summary: {
                    type: 'object',
                    properties: {
                        overall_risk_rating: {
                            type: 'string',
                            enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
                        },
                        assessment_scope: { type: 'string' },
                        key_statistics: {
                            type: 'object',
                            properties: {
                                vulnerabilities_tested:  { type: 'integer' },
                                confirmed_exploitable:   { type: 'integer' },
                                code_confirmed:          { type: 'integer' },
                                not_exploitable:         { type: 'integer' },
                                severity_breakdown: {
                                    type: 'object',
                                    properties: {
                                        critical: { type: 'integer' },
                                        high:     { type: 'integer' },
                                        medium:   { type: 'integer' },
                                        low:      { type: 'integer' },
                                    },
                                    required: ['critical', 'high', 'medium', 'low'],
                                },
                            },
                            required: ['vulnerabilities_tested', 'confirmed_exploitable', 'severity_breakdown'],
                        },
                        top_findings: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name:        { type: 'string' },
                                    severity:    { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
                                    description: { type: 'string' },
                                    ref_poc_ids: { type: 'array', items: { type: 'string' } },
                                },
                                required: ['name', 'severity', 'description', 'ref_poc_ids'],
                            },
                        },
                        critical_attack_chains: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                        immediate_remediation_priorities: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                    },
                    required: [
                        'overall_risk_rating', 'assessment_scope', 'key_statistics',
                        'top_findings', 'critical_attack_chains', 'immediate_remediation_priorities',
                    ],
                },
                common_variables: {
                    type: 'object',
                    description: 'Key-value pairs of shared variables used across PoCs (e.g. BASE_URL, SESSION_SECRET)',
                },
                chaining_register: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            extracted_by: { type: 'string' },
                            data_type:    { type: 'string' },
                            value:        { type: 'string' },
                            enables:      { type: 'array', items: { type: 'string' } },
                            chained:      { type: 'boolean' },
                        },
                        required: ['extracted_by', 'data_type', 'value', 'enables', 'chained'],
                    },
                },
                poc_entries: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            poc_id:  { type: 'string' },
                            title:   { type: 'string' },
                            severity: {
                                type: 'string',
                                enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
                            },
                            vulnerability: { type: 'string' },
                            source: {
                                type: 'object',
                                properties: {
                                    file_path: { type: 'string' },
                                    lines:     { type: 'string' },
                                    code:      { type: 'string' },
                                },
                                required: ['file_path', 'lines', 'code'],
                            },
                            sink: {
                                type: 'object',
                                properties: {
                                    file_path: { type: 'string' },
                                    lines:     { type: 'string' },
                                    code:      { type: 'string' },
                                },
                                required: ['file_path', 'lines', 'code'],
                            },
                            poc_commands: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        label:   { type: 'string' },
                                        command: { type: 'string' },
                                        execution_result: {
                                            type: 'object',
                                            properties: {
                                                status_code:   { type: ['integer', 'null'] },
                                                response_body: { type: 'string' },
                                            },
                                            required: ['status_code', 'response_body'],
                                        },
                                    },
                                    required: ['label', 'command', 'execution_result'],
                                },
                            },
                            analysis: {
                                type: 'object',
                                properties: {
                                    confirmed:      { type: 'boolean' },
                                    markers:        { type: 'array', items: { type: 'string' } },
                                    exploitability: { type: 'string' },
                                },
                                required: ['confirmed', 'markers', 'exploitability'],
                            },
                            why_it_works:       { type: 'string' },
                            met_status:         { type: 'string' },
                            chaining_artifacts: { type: 'array', items: { type: 'string' } },
                        },
                        required: [
                            'poc_id', 'title', 'severity', 'vulnerability',
                            'source', 'sink', 'poc_commands', 'analysis',
                            'why_it_works', 'met_status', 'chaining_artifacts',
                        ],
                    },
                },
                chain_entries: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            chain_id:      { type: 'string' },
                            title:         { type: 'string' },
                            severity:      { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
                            summary:       { type: 'string' },
                            prerequisites: { type: 'array', items: { type: 'string' } },
                            steps: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        step:        { type: 'integer' },
                                        description: { type: 'string' },
                                        output:      { type: 'string' },
                                    },
                                    required: ['step', 'description', 'output'],
                                },
                            },
                            compound_script:   { type: 'string' },
                            execution_result:  { type: 'string' },
                            analysis:          { type: 'string' },
                        },
                        required: [
                            'chain_id', 'title', 'severity', 'summary',
                            'prerequisites', 'steps', 'compound_script',
                            'execution_result', 'analysis',
                        ],
                    },
                },
                summary_matrix: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            poc_id:        { type: 'string' },
                            vulnerability: { type: 'string' },
                            severity:      { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
                            effort:        { type: 'string' },
                            vector:        { type: 'string' },
                            executed:      { type: 'boolean' },
                            met_status:    { type: 'string' },
                        },
                        required: ['poc_id', 'vulnerability', 'severity', 'effort', 'vector', 'executed', 'met_status'],
                    },
                },
                not_exploitable: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            finding:    { type: 'string' },
                            source:     { type: 'string' },
                            blocker:    { type: 'string' },
                            met_status: { type: 'string' },
                        },
                        required: ['finding', 'source', 'blocker', 'met_status'],
                    },
                },
                final_summary: {
                    type: 'object',
                    properties: {
                        total_vulnerabilities_analyzed: { type: 'integer' },
                        pocs_generated:                { type: 'integer' },
                        executed_safely:               { type: 'integer' },
                        code_confirmed:                { type: 'integer' },
                        not_applicable:                { type: 'integer' },
                        severity_breakdown: {
                            type: 'object',
                            properties: {
                                critical: { type: 'integer' },
                                high:     { type: 'integer' },
                                medium:   { type: 'integer' },
                                low:      { type: 'integer' },
                            },
                            required: ['critical', 'high', 'medium', 'low'],
                        },
                        met_satisfied:              { type: 'integer' },
                        met_partial:                { type: 'integer' },
                        met_blocked:                { type: 'integer' },
                        variants_created:           { type: 'integer' },
                        chaining_register_entries:  { type: 'integer' },
                        chains_executed:            { type: 'integer' },
                        chains_blocked:             { type: 'integer' },
                    },
                    required: [
                        'total_vulnerabilities_analyzed', 'pocs_generated',
                        'executed_safely', 'severity_breakdown',
                        'met_satisfied', 'met_partial', 'met_blocked',
                        'chains_executed', 'chains_blocked',
                    ],
                },
            },
            required: [
                'metadata', 'executive_summary', 'common_variables',
                'chaining_register', 'poc_entries', 'chain_entries',
                'summary_matrix', 'not_exploitable', 'final_summary',
            ],
        },
    },
    required: ['poc_report'],
};

export const recon_output_schema = {
    type: 'object',
    properties: {
        metadata: {
            type: 'object',
            properties: {
                target_domain: { type: 'string' },
                target_ip: { type: 'string' },
                scan_timestamp: { type: 'string', description: 'ISO 8601' },
                tools_executed: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            version: { type: 'string' },
                            exit_code: { type: 'integer' },
                            raw_finding_count: { type: 'integer' },
                        },
                        required: ['name', 'exit_code'],
                    },
                },
                overall_risk_signal: {
                    type: 'string',
                    enum: ['critical', 'high', 'medium', 'low', 'informational'],
                },
            },
            required: ['target_domain', 'scan_timestamp', 'tools_executed', 'overall_risk_signal'],
        },
        executive_summary: { type: 'string' },
        dns_records: {
            type: 'object',
            properties: {
                a_records:     { type: 'array', items: { type: 'string' } },
                aaaa_records:  { type: 'array', items: { type: 'string' } },
                mx_records:    { type: 'array', items: { type: 'string' } },
                ns_records:    { type: 'array', items: { type: 'string' } },
                txt_records:   { type: 'array', items: { type: 'string' } },
                cname_records: { type: 'array', items: { type: 'string' } },
                soa_record:    { type: 'string' },
                zone_transfer_possible: { type: 'boolean' },
                dnssec_enabled:         { type: 'boolean' },
            },
            required: ['a_records', 'mx_records', 'ns_records', 'txt_records'],
        },
        whois: {
            type: 'object',
            properties: {
                registrar:      { type: 'string' },
                creation_date:  { type: 'string' },
                expiry_date:    { type: 'string' },
                registrant_org: { type: 'string' },
                name_servers:   { type: 'array', items: { type: 'string' } },
                raw_summary:    { type: 'string' },
            },
            required: ['registrar', 'name_servers'],
        },
        subdomains: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    hostname:     { type: 'string' },
                    ip_address:   { type: 'string' },
                    source:       { type: 'string', description: 'subfinder, crt.sh, dns_bruteforce, etc.' },
                    http_status:  { type: 'integer' },
                    title:        { type: 'string' },
                    technologies: { type: 'array', items: { type: 'string' } },
                    interesting: {
                        type: 'boolean',
                        description: 'True if subdomain suggests staging, admin, internal, API, or dev environment',
                    },
                },
                required: ['hostname', 'source'],
            },
        },
        ports: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    port:     { type: 'integer' },
                    protocol: { type: 'string' },
                    state:    { type: 'string' },
                    service:  { type: 'string' },
                    version:  { type: 'string' },
                    banner:   { type: 'string' },
                    nmap_scripts: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id:     { type: 'string' },
                                output: { type: 'string' },
                            },
                            required: ['id', 'output'],
                        },
                    },
                    risk_notes: { type: 'string' },
                },
                required: ['port', 'protocol', 'state', 'service'],
            },
        },
        tls_analysis: {
            type: 'object',
            properties: {
                certificate: {
                    type: 'object',
                    properties: {
                        subject:             { type: 'string' },
                        issuer:              { type: 'string' },
                        valid_from:          { type: 'string' },
                        valid_until:         { type: 'string' },
                        san_entries:         { type: 'array', items: { type: 'string' } },
                        key_type:            { type: 'string' },
                        key_size:            { type: 'integer' },
                        signature_algorithm: { type: 'string' },
                        is_expired:          { type: 'boolean' },
                        is_self_signed:      { type: 'boolean' },
                    },
                    required: ['subject', 'issuer', 'valid_until', 'san_entries'],
                },
                protocols_supported: { type: 'array', items: { type: 'string' } },
                weak_protocols:      { type: 'array', items: { type: 'string' } },
                cipher_suites:       { type: 'array', items: { type: 'string' } },
                weak_ciphers:        { type: 'array', items: { type: 'string' } },
                vulnerabilities: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name:        { type: 'string', description: 'e.g. BEAST, POODLE, Heartbleed, ROBOT' },
                            severity:    { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
                            description: { type: 'string' },
                        },
                        required: ['name', 'severity'],
                    },
                },
                hsts_header:    { type: 'string' },
                ocsp_stapling:  { type: 'boolean' },
            },
            required: ['certificate', 'protocols_supported', 'vulnerabilities'],
        },
        http_security_headers: {
            type: 'object',
            properties: {
                target_url: { type: 'string' },
                headers_present: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name:       { type: 'string' },
                            value:      { type: 'string' },
                            assessment: { type: 'string', enum: ['secure', 'weak', 'misconfigured'] },
                            notes:      { type: 'string' },
                        },
                        required: ['name', 'value', 'assessment'],
                    },
                },
                headers_missing: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name:           { type: 'string' },
                            risk:           { type: 'string', enum: ['high', 'medium', 'low'] },
                            recommendation: { type: 'string' },
                        },
                        required: ['name', 'risk'],
                    },
                },
            },
            required: ['target_url', 'headers_present', 'headers_missing'],
        },
        waf_detection: {
            type: 'object',
            properties: {
                waf_detected:    { type: 'boolean' },
                waf_name:        { type: 'string' },
                detection_method: { type: 'string' },
                bypass_notes:    { type: 'string' },
            },
            required: ['waf_detected'],
        },
        technologies: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name:       { type: 'string' },
                    version:    { type: 'string' },
                    category:   { type: 'string', description: 'e.g. web-server, framework, cms, cdn, analytics' },
                    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                    cpe:        { type: 'string', description: 'CPE string if identifiable' },
                },
                required: ['name', 'category', 'confidence'],
            },
        },
        discovered_endpoints: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    url:            { type: 'string' },
                    status_code:    { type: 'integer' },
                    content_length: { type: 'integer' },
                    content_type:   { type: 'string' },
                    source:         { type: 'string', description: 'feroxbuster, robots.txt, sitemap.xml, common_path_check' },
                    interesting:    { type: 'boolean' },
                    notes:          { type: 'string' },
                },
                required: ['url', 'status_code', 'source'],
            },
        },
        certificate_transparency: {
            type: 'array',
            items: { type: 'string' },
            description: 'Hostnames discovered via crt.sh or CT log search',
        },
        findings: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    finding_id: { type: 'string', description: 'e.g. RECON-001' },
                    title:      { type: 'string' },
                    severity:   { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
                    category: {
                        type: 'string',
                        enum: [
                            'exposed_service', 'weak_tls', 'missing_header',
                            'information_disclosure', 'subdomain_takeover',
                            'waf_bypass', 'dns_misconfiguration', 'certificate_issue',
                            'directory_listing', 'default_credentials', 'other',
                        ],
                    },
                    description:             { type: 'string' },
                    evidence:                { type: 'string' },
                    exploitation_hypothesis: { type: 'string' },
                    affected_host:           { type: 'string' },
                    affected_port:           { type: 'integer' },
                },
                required: ['finding_id', 'title', 'severity', 'category', 'description', 'evidence'],
            },
        },
        poc_targets: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    finding_id:  { type: 'string' },
                    target_url:  { type: 'string' },
                    attack_type: { type: 'string' },
                    hypothesis:  { type: 'string' },
                    priority:    { type: 'integer', description: '1 = highest priority' },
                },
                required: ['finding_id', 'target_url', 'attack_type', 'hypothesis', 'priority'],
            },
            description: 'Prioritized list of recon findings for the POC agent to target',
        },
    },
    required: [
        'metadata',
        'executive_summary',
        'dns_records',
        'subdomains',
        'ports',
        'tls_analysis',
        'http_security_headers',
        'waf_detection',
        'technologies',
        'findings',
        'poc_targets',
    ],
};

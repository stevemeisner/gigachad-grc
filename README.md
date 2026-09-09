
![gigachad grc](https://github.com/user-attachments/assets/22d32df8-2e61-420e-bc98-df7c291ac8a4)

# GigaChad GRC

[![License: Elastic-2.0](https://img.shields.io/badge/License-Elastic--2.0-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A comprehensive, modular, containerized Governance, Risk, and Compliance (GRC) platform built with modern technologies. Manage your entire security program from compliance tracking to risk management, third-party assessments, and external audits.

---

## 🚀 Try It Now

One command brings the whole platform up locally — infrastructure in Docker, the six services and the UI on your machine:

```bash
git clone https://github.com/rajkrishnamurthy/gigachad-grc.git
cd gigachad-grc
./scripts/start-demo.sh          # same as: npm run demo
```

You need Docker running and Node.js 18+ with npm. The first run installs dependencies and takes a few minutes; subsequent starts finish in well under a minute. When it finishes, open **http://localhost:3000** and click **Dev Login (Skip SSO)** — the demo organization arrives pre-loaded with roughly a thousand sample records.

Stop it again with `./scripts/stop-demo.sh` (or `npm run demo:stop`).

➡️ Full walkthrough, flags and runtime layout: **[Quick Start](#quick-start)** below. Sample-data details: **[Demo & Sandbox Guide](docs/DEMO.md)**. If something goes wrong: **[Troubleshooting](docs/TROUBLESHOOTING.md)**.

---

## 📚 Documentation

### Core Documentation

| Document | Description |
|----------|-------------|
| [Architecture Guide](docs/ARCHITECTURE.md) | System architecture, API gateway, microservices, network topology |
| [API Reference](docs/API.md) | Complete API documentation with endpoints, authentication, examples |
| [Configuration Reference](docs/CONFIGURATION.md) | Environment variables, service configuration, Traefik, database |
| [Development Guide](docs/DEVELOPMENT.md) | Local setup, project structure, coding standards, testing |
| [Deployment Guide](docs/DEPLOYMENT.md) | Production deployment, CI/CD, monitoring, backups |
| [Quick Start Guide](docs/QUICK_START.md) | Get up and running quickly with GigaChad GRC |
| [Demo & Sandbox](docs/DEMO.md) | Try GigaChad GRC with sample data, one-click demo setup |
| [Upgrade Guide](docs/UPGRADE.md) | Upgrading between versions, migration steps |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues and solutions |

### Security & Compliance

| Document | Description |
|----------|-------------|
| [Security Policy](SECURITY.md) | Security vulnerability reporting and policies |
| [Security Audit](docs/SECURITY_AUDIT.md) | Dependency audit findings, vulnerability status, remediation |
| [Security Model](docs/SECURITY_MODEL.md) | Comprehensive security architecture, authentication, authorization, and hardening |
| [Permissions Matrix](docs/PERMISSIONS_MATRIX.md) | Role-based access control and permission definitions |
| [MCP Credential Security](docs/security/mcp-credential-security.md) | Secure handling of MCP server credentials |

### Configuration & Operations

| Document | Description |
|----------|-------------|
| [Environment Configuration](docs/ENV_CONFIGURATION.md) | Detailed environment variable reference |
| [Module Configuration](docs/MODULE_CONFIGURATION.md) | Enable/disable platform modules |
| [Production Deployment](docs/PRODUCTION_DEPLOYMENT.md) | Production-ready deployment checklist |

### Platform Guides

| Document | Description |
|----------|-------------|
| [Platform Review](docs/PLATFORM_REVIEW.md) | Comprehensive platform capabilities overview |
| [Help Center](docs/help/README.md) | User guides and how-to documentation |
| [MCP Quick Start](docs/guides/mcp-quick-start.md) | Getting started with MCP server integration |

### Audit & Stability Reports

| Document | Description |
|----------|-------------|
| [Stability Audit Phase 1](docs/STABILITY_AUDIT_PHASE1_REPORT.md) | Phase 1 stability audit findings and fixes |
| [Stability Audit Phase 2](docs/STABILITY_AUDIT_PHASE2_REPORT.md) | Phase 2 stability audit findings and fixes |

### Quick Links

- **API Gateway**: Traefik v3.0 - [Configuration Details](docs/ARCHITECTURE.md#api-gateway-traefik)
- **Authentication**: Keycloak OAuth 2.0 - [Setup Guide](docs/CONFIGURATION.md#keycloak-configuration)
- **Database**: PostgreSQL 16 - [Schema Details](docs/CONFIGURATION.md#database-configuration)
- **Monitoring**: Prometheus + Grafana - [Setup Guide](monitoring/README.md)
- **AI Integration**: OpenAI/Anthropic - [AI Configuration](docs/help/ai-mcp/risk-assistant.md)

## Platform Overview

GigaChad GRC is a complete enterprise GRC solution organized into specialized modules, each handling a critical aspect of your compliance and risk management program:

- **Compliance**: Controls, frameworks, policies, and evidence management
- **Data Management**: Evidence library, policies, assets, and integrations
- **Risk Management**: Risk register, scenarios, heatmaps, and treatment tracking
- **Third-Party Risk (TPRM)**: Vendor management, assessments, and contracts
- **Trust**: Security questionnaires, knowledge base, and public trust center
- **Audit**: Internal and external compliance audits with auditor portal
- **Tools**: Awareness training, security education programs
- **AI & Automation**: AI-powered risk scoring, categorization, smart search, and MCP server integration
- **Administration**: User management, permissions, audit logs, and settings

## Modules & Capabilities

### 1. Compliance Module

#### Controls Management (Port 3001)
Complete lifecycle management for security controls across all frameworks.

**Features:**
- Control library with pre-loaded SOC 2 and ISO 27001 controls
- Implementation status tracking (Not Started, In Progress, Implemented, Validated)
- Testing history with evidence collection
- Control owners and assignment
- Evidence linking and attachment
- Test scheduling and reminders
- Control effectiveness scoring
- Cross-framework mapping

**API Endpoints:**
- `GET/POST /api/controls` - List and create controls
- `GET/PATCH/DELETE /api/controls/:id` - Manage individual controls
- `GET /api/controls/:id/evidence` - View linked evidence
- `POST /api/controls/:id/test` - Record testing activities

#### Frameworks (Port 3002)
Framework readiness assessment and gap analysis for major compliance standards.

**Pre-loaded Frameworks:**
- SOC 2 Type II (Trust Services Criteria)
- ISO 27001:2022 (with Annex A controls)
- NIST CSF 2.0 (ready)
- PCI DSS (ready)
- HIPAA (ready)
- Custom frameworks

**Features:**
- Real-time readiness scoring
- Gap analysis with prioritized recommendations
- Control mapping across frameworks
- Implementation roadmaps
- Evidence collection per requirement
- Compliance status dashboards
- Framework comparison and overlap analysis

**API Endpoints:**
- `GET /api/frameworks` - List all frameworks
- `GET /api/frameworks/:id` - Framework details with requirements
- `GET /api/frameworks/:id/readiness` - Calculate readiness score
- `POST /api/frameworks/:id/assess` - Submit control assessments

### 2. Data Management Module

#### Evidence Library (Port 3001 — served by the controls service)
Centralized repository for all compliance evidence with intelligent organization.

**Features:**
- Multi-backend storage (Local, MinIO/S3, Azure Blob)
- Document versioning and history
- Evidence types (Policy, Procedure, Screenshot, Report, Log, Certificate)
- Control linking with many-to-many relationships
- Automated retention policies
- Full-text search and filtering
- Collection dates and validity periods
- Evidence review workflows

**API Endpoints:**
- `GET/POST /api/evidence` - List and upload evidence
- `GET/DELETE /api/evidence/:id` - Manage evidence items
- `GET /api/evidence/:id/download` - Download evidence files

#### Policies (Port 3004)
Policy lifecycle management with versioning and approval workflows.

**Features:**
- Policy document management with versions
- Approval workflows (Draft → Review → Approved → Published)
- Review scheduling and reminders
- Control linking
- Policy effectiveness tracking
- Document history and audit trail
- Policy categories and tagging

**API Endpoints:**
- `GET/POST /api/policies` - List and create policies
- `GET /api/policies/:id` - Policy details
- `POST /api/policies/:id/approve` - Approve policy version
- `GET /api/policies/:id/versions` - Version history

#### Assets
IT asset inventory with security metadata and classification.

**Features:**
- Asset inventory management (Hardware, Software, Data, People, Services)
- Criticality classification (Critical, High, Medium, Low)
- Data sensitivity classification (Public, Internal, Confidential, Restricted)
- Asset owner assignment
- Risk and control linking
- Business process association
- Asset lifecycle tracking (Active, Retired, Decommissioned)
- Custom metadata and tagging

**API Endpoints:**
- `GET/POST /api/assets` - List and create assets
- `GET/PATCH/DELETE /api/assets/:id` - Manage individual assets
- `POST /api/assets/:id/link` - Link assets to risks/controls

#### Integrations
External tool integrations for automated evidence collection.

**Supported Integrations:**
- **AWS**: S3 bucket configs, IAM policies, EC2 security groups, VPC flow logs, Config rules
- **Azure**: Resource inventory, security center findings, compliance policies
- **GitHub**: Branch protection rules, Dependabot alerts, secrets scanning, code scanning
- **Okta**: MFA enrollment, password policies, inactive users, admin access logs
- **Google Workspace**: User MFA status, admin roles, Drive sharing settings
- **Jamf**: Device encryption status, OS versions, security patch compliance

**Features:**
- Scheduled evidence collection (hourly, daily, weekly)
- Credential management with encryption
- Collection history and status tracking
- Automatic evidence upload to library
- Integration health monitoring

**API Endpoints:**
- `GET/POST /api/integrations` - Integration management
- `POST /api/integrations/:id/test` - Test connection
- `POST /api/integrations/:id/collect` - Trigger manual collection

### 3. Risk Management Module (Port 3001)

Complete enterprise risk management with quantitative and qualitative approaches.

#### Risk Dashboard
Executive overview of organizational risk posture.

**Metrics:**
- Total risks by severity
- Risk trend analysis
- Treatment status
- High-priority risks
- Risk appetite vs. actual
- Top risk categories

#### Risk Register
Central repository for all identified risks with comprehensive tracking.

**Features:**
- Risk identification and documentation
- Likelihood and impact scoring (1-5 scale)
- Inherent vs. residual risk calculation
- Risk owners and accountability
- Treatment plans (Accept, Mitigate, Transfer, Avoid)
- Status tracking (Identified → Assessed → Treated → Monitored)
- Control linking and effectiveness
- Risk categories and tagging

**Risk Scoring:**
- Quantitative: Likelihood × Impact (1-25 scale)
- Qualitative: Low, Medium, High, Critical
- Customizable risk matrices
- Automated risk level calculations

#### Risk Heatmap
Visual risk matrix showing risk distribution by likelihood and impact.

**Features:**
- Interactive heat map visualization
- Risk clustering by category
- Drill-down to risk details
- Filter by status, owner, category
- Export to PDF/PNG

#### Risk Scenarios
Scenario-based risk modeling and planning.

**Features:**
- Threat scenario modeling
- Impact analysis
- Mitigation strategy planning
- Scenario libraries (Cyber attacks, Data breaches, Disasters)

#### My Risk Queue
Personal task list for assigned risks and actions.

**Features:**
- Assigned risks requiring action
- Overdue treatment plans
- Upcoming risk reviews
- Evidence collection tasks

#### Risk Reports
Comprehensive risk reporting and analytics.

**Report Types:**
- Executive risk summary
- Risk register report
- Treatment effectiveness
- Risk trend analysis
- Control effectiveness
- Custom reports with filters

**API Endpoints:**
- `GET/POST /api/risks` - List and create risks
- `GET/PATCH /api/risks/:id` - Manage risks
- `POST /api/risks/:id/assess` - Update risk assessment
- `GET /api/risk-dashboard` - Dashboard statistics
- `GET /api/risk-heatmap` - Heatmap data

### 4. Third-Party Risk Management (TPRM) (Port 3005)

Complete vendor risk management lifecycle.

#### Vendor Management
Centralized vendor database with risk profiles.

**Features:**
- Vendor contact information
- Risk tier classification (Critical, High, Medium, Low)
- Vendor categories (Cloud, SaaS, Consultant, etc.)
- Vendor status (Active, Under Review, Offboarded)
- Due diligence documentation
- Vendor lifecycle tracking
- Relationship owners

#### Assessments
Security assessments and questionnaires for vendors.

**Assessment Types:**
- Initial due diligence
- Annual reviews
- Incident-triggered assessments
- Ad-hoc assessments

**Features:**
- Customizable questionnaire templates
- Assessment scoring and risk rating
- Finding tracking and remediation
- Evidence collection from vendors
- Assessment history and trends
- Approval workflows

#### Contracts
Contract lifecycle management for vendor relationships.

**Features:**
- Contract metadata (dates, value, terms)
- SLA tracking
- Renewal reminders
- Contract document storage
- Amendment history
- Contract status (Draft, Active, Expiring, Expired)
- Vendor linking

**API Endpoints:**
- `GET/POST /api/vendors` - Vendor management
- `GET/POST /api/vendor-assessments` - Vendor assessment workflows (the proxy rewrites this to `/assessments` inside the service; the unprefixed `/api/assessments` route belongs to the frameworks service on port 3002)
- `GET/POST /api/contracts` - Contract management

### 5. Trust Module (Port 3006)

Build and maintain customer trust through transparency and responsiveness.

#### Questionnaires
Security questionnaire response management system.

**Features:**
- Questionnaire templates (SOC 2, ISO 27001, Custom)
- Question bank with reusable answers
- Response history and versioning
- Customer portal for submission
- Approval workflows
- Evidence attachment
- Auto-population from knowledge base

#### Knowledge Base
Centralized security knowledge repository for consistent responses.

**Features:**
- Question and answer library
- Categories and tagging
- Search and filtering
- Version control
- Approval workflows
- Control/policy linking
- Confidence scoring

**Use Cases:**
- Pre-populate questionnaire responses
- Sales engineering reference
- Customer FAQ
- Internal training

#### Trust Center
Public-facing security and compliance transparency portal.

**Features:**
- Customizable branding (logo, colors, description)
- Section-based content management:
  - **Overview**: Company security commitment
  - **Certifications & Compliance**: Frameworks and certifications
  - **Security Controls**: Technical and operational controls
  - **Policies & Documentation**: Security policies
  - **Security Updates**: News and incident communications
  - **Contact**: Security team contact information
- Publish/draft workflow
- Preview mode before publishing
- SEO-friendly public URLs
- Responsive design

**API Endpoints:**
- `GET/POST /api/questionnaires` - Questionnaire management
- `GET/POST /api/knowledge-base` - Knowledge base entries
- `GET/PATCH /api/trust-center/config` - Trust center configuration
- `GET/POST /api/trust-center/content` - Content management
- `GET /api/trust-center/public` - Public trust center view

### 6. Audit Module (Port 3007)

Comprehensive audit management for internal and external compliance audits.

#### Audits
Central audit management with support for multiple audit types.

**Audit Types:**
- Internal audits
- External audits (SOC 2, ISO 27001)
- Surveillance audits
- Certification audits

**Features:**
- Audit planning and scoping
- Framework selection (SOC 2, ISO 27001, HIPAA, PCI DSS)
- Audit team management
- External auditor information tracking
- Timeline tracking (planned vs. actual)
- Audit status workflow (Planning → Fieldwork → Testing → Reporting → Completed)
- Finding aggregation and statistics
- Portal access for external auditors
- FieldGuide integration ready

**Auditor Portal:**
- Secure access code generation
- Temporary access with expiration
- Document request submission
- Evidence review interface
- Comment threads on requests

#### Audit Requests
Evidence and documentation request tracking.

**Request Categories:**
- Control documentation
- Policy review
- Evidence collection
- Interviews
- System access
- Walkthroughs

**Features:**
- Request assignment to internal team
- Priority levels (Low, Medium, High, Critical)
- Due date tracking with overdue alerts
- Status workflow (Open → In Progress → Submitted → Under Review → Approved)
- Evidence attachment
- Comment threads
- Clarification requests
- Control/requirement linking

#### Findings
Audit finding and observation management.

**Finding Types:**
- Control deficiencies
- Documentation gaps
- Process issues
- Compliance gaps

**Features:**
- Severity classification (Critical, High, Medium, Low, Observation)
- Root cause analysis
- Impact assessment
- Remediation planning
- Remediation owner assignment
- Target and actual completion dates
- Management response tracking
- Status tracking (Open → Remediation Planned → In Progress → Resolved)
- Control/requirement linking

#### Additional Capabilities:
- **Test Results**: Control testing with sampling methodologies
- **Meetings**: Audit kickoffs, status updates, interviews, closing meetings
- **Activity Log**: Complete audit trail of all actions
- **Dashboard**: Real-time audit statistics and progress

**API Endpoints:**
- `GET/POST /api/audits` - Audit management
- `GET /api/audits/dashboard` - Audit statistics
- `POST /api/audits/:id/portal/enable` - Enable auditor portal
- `GET/POST /api/audit-requests` - Request management
- `POST /api/audit-requests/:id/comments` - Discussion threads
- `GET/POST /api/audit-findings` - Finding management

**FieldGuide Integration:**
- OAuth 2.0 authentication with FieldGuide
- Bi-directional sync with FieldGuide platform
- Audit data synchronization
- Request mapping with automatic updates
- Evidence sharing between platforms
- Webhook support for real-time updates
- Conflict resolution for simultaneous edits
- Sync history and audit logging

**FieldGuide API Endpoints:**
- `GET /api/fieldguide/connect` - Initiate OAuth connection
- `GET /api/fieldguide/callback` - OAuth callback handler
- `POST /api/fieldguide/sync` - Trigger bi-directional sync
- `POST /api/fieldguide/webhooks` - Webhook receiver

### 7. Tools Module

#### Awareness & Training
Comprehensive security awareness training program management.

**Features:**
- Training course management (Security Basics, Phishing Awareness, Data Protection, etc.)
- Training assignment to users and groups
- Progress tracking and completion status
- Quiz engine with multiple question types
- Certificate generation upon completion
- Compliance tracking for required training
- Training content management

**Quiz Engine:**
- Multiple choice, true/false, and multi-select questions
- Configurable passing scores
- Question randomization
- Answer explanations
- Retake policies

**Certificate Features:**
- Automatic generation on course completion
- PDF download
- Unique certificate IDs for verification
- Expiration dates for recurring training

**API Endpoints:**
- `GET/POST /api/training/courses` - Course management
- `GET/POST /api/training/assignments` - Assign training
- `POST /api/training/:courseId/quiz` - Take quiz
- `GET /api/training/:courseId/certificate` - Download certificate

#### Phishing Simulations
Security awareness through realistic phishing simulations.

**Campaign Features:**
- Campaign creation with templates
- Target group selection
- Scheduling (immediate, scheduled, recurring)
- Email template customization
- Landing page configuration
- Real-time tracking and analytics

**Analytics & Reporting:**
- Click rates by department
- Report rates
- Training completion correlation
- Historical trend analysis
- User risk scoring
- Department benchmarking

**Template Library:**
- Pre-built phishing templates (Credential harvesting, Malware, Gift card scams, etc.)
- Custom template creation
- Template difficulty ratings
- Industry-specific templates

**API Endpoints:**
- `GET/POST /api/phishing/campaigns` - Campaign management
- `GET /api/phishing/campaigns/:id/analytics` - Campaign analytics
- `GET/POST /api/phishing/templates` - Template management
- `POST /api/phishing/report` - User phishing report submission

### 8. AI & Automation Module

Enterprise AI capabilities and MCP (Model Context Protocol) server integration for intelligent GRC operations.

#### AI Configuration
Configurable OpenAI or Anthropic models — see [docs/help/ai-mcp/ai-configuration.md](docs/help/ai-mcp/ai-configuration.md) for the provider and model options and how to set them.

**AI Features**:
- **Risk Scoring**: AI-suggested risk likelihood and impact with rationale
- **Auto-Categorization**: Automatic categorization and tagging of controls, risks, policies
- **Smart Search**: Natural language search across all GRC modules
- **Policy Drafting**: Generate policy drafts based on requirements and context
- **Control Suggestions**: AI-recommended controls for risks and compliance requirements

#### MCP Server Integration
Model Context Protocol servers for automated GRC workflows.

**Available MCP Servers**:
- **grc-evidence**: Automated evidence collection from cloud providers and security tools
  - AWS (S3, IAM, EC2, VPC, Config)
  - Azure resources
  - GitHub (branch protection, secrets scanning, Dependabot)
  - Okta (MFA status, password policies, inactive users)
  - Google Workspace (user MFA, admin roles, sharing settings)
  - Jamf (device encryption, OS versions, security patches)
  - Vulnerability scanning integration
  - Screenshot capture for visual evidence

- **grc-compliance**: Automated compliance checking and reporting
  - Control testing automation
  - Policy validation against requirements
  - Compliance report generation
  - Framework-specific checks (SOC 2, ISO 27001, HIPAA, GDPR)

- **grc-ai-assistant**: AI-powered GRC operations
  - Deep risk analysis with contextual understanding
  - Control recommendations based on risks and requirements
  - Policy document drafting
  - Automatic requirement mapping
  - Finding explanation in plain language
  - Remediation prioritization
  - Compliance gap analysis
  - Vendor risk assessment

**API Endpoints**:
- `GET /api/ai/config` - Get AI configuration
- `POST /api/ai/risk-scoring` - AI risk scoring suggestions
- `POST /api/ai/categorize` - Auto-categorization
- `POST /api/ai/search` - Smart natural language search
- `GET /api/mcp/servers` - List active MCP servers
- `POST /api/mcp/tools/call` - Execute MCP tool
- `POST /api/mcp/workflows` - Manage MCP workflows

### 9. Settings & Administration

#### User Management
User account and access control management via Keycloak.

**Features:**
- User provisioning and deactivation
- Role assignment (Admin, Compliance Manager, Auditor, Viewer)
- SSO integration via Keycloak
- Multi-factor authentication
- Session management

#### Permissions
Role-based access control and permission groups.

**Default Roles:**
- **Admin**: Full system access
- **Compliance Manager**: Manage controls, evidence, frameworks
- **Risk Manager**: Manage risks and treatments
- **Auditor**: Read-only access to controls and evidence
- **Viewer**: Limited read access

#### Audit Log
Complete system audit trail for compliance and forensics.

**Tracked Events:**
- User actions (login, logout, changes)
- Entity changes (create, update, delete)
- Access attempts
- Configuration changes
- Evidence uploads/downloads
- Approval actions

**Features:**
- Search and filtering
- Export to CSV
- Date range queries
- User activity reports
- Change history with before/after values

#### Risk Configuration
Risk management system configuration.

**Settings:**
- Risk scoring methodology
- Likelihood definitions (1-5)
- Impact definitions (1-5)
- Risk appetite thresholds
- Risk categories
- Treatment options
- Review frequencies

## Dashboard

The main dashboard provides an executive overview of your entire GRC program:

**Compliance Metrics:**
- Overall compliance score
- Control implementation status
- Framework readiness percentages
- Evidence collection status
- Upcoming control tests

**Risk Metrics:**
- Risk distribution by severity
- High-priority risks requiring attention
- Risk treatment progress
- Top risk categories

**Audit Metrics:**
- Active audits
- Open audit requests
- Pending findings
- Upcoming audit activities

**Recent Activity:**
- Control updates
- Evidence uploads
- Risk assessments
- Audit progress
- Policy approvals

## Architecture

The diagram below is the full container topology described by `docker-compose.yml`. The local demo runs a subset of it: Traefik is not started, and the Vite dev server proxies `/api/*` to the services instead — see [Architecture at runtime](#architecture-at-runtime).

```
┌───────────────────────────────────────────────────────────────────────┐
│                           Traefik Gateway                              │
│                           (API Routing)                                │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬────┤
│ Controls │Frameworks│ Policies │   TPRM   │  Trust   │  Audit   │ UI │
│  :3001   │  :3002   │  :3004   │  :3005   │  :3006   │  :3007   │:3000
├──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴────┤
│                          Shared Library                                │
│          (Prisma Schema, Types, Auth, Storage, Events)                 │
├──────────┬──────────┬──────────┬──────────────────────────────────────┤
│PostgreSQL│  Redis   │ Keycloak │              MinIO                   │
│  :5433   │  :6380   │  :8080   │         :9000 / :9001                │
│(Database)│ (Cache)  │  (Auth)  │        (Object Storage)              │
└──────────┴──────────┴──────────┴──────────────────────────────────────┘

Frontend (React + Vite)
    ↓
Traefik (API Gateway)
    ↓
Microservices Layer:
  - Controls Service (NestJS) → Controls + Evidence + Audit Logging
  - Frameworks Service (NestJS) → Frameworks + Risk Management
  - Policies Service (NestJS) → Policy Lifecycle
  - TPRM Service (NestJS) → Vendors + Assessments + Contracts
  - Trust Service (NestJS) → Questionnaires + Knowledge Base + Trust Center
  - Audit Service (NestJS) → Audit Management + Auditor Portal
    ↓
Infrastructure Layer:
  - PostgreSQL (Single database, multi-tenant schema)
  - Redis (Caching + Session Management)
  - Keycloak (SSO + RBAC)
  - MinIO (S3-compatible object storage)
```

## Tech Stack

- **Backend**: Node.js + TypeScript with NestJS
- **Frontend**: React + TypeScript with Vite, TailwindCSS
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Keycloak (SSO, RBAC)
- **API Gateway**: Traefik
- **Cache/Events**: Redis
- **Storage**: MinIO (S3-compatible)
- **Containers**: Docker with Docker Compose

## Quick Start

### Prerequisites

- **Docker** (Desktop, Colima or Engine) running, with the Compose v2 plugin (`docker compose`)
- **Node.js 18+** (20+ recommended) and npm
- These host ports free: `3000`, `3001`, `3002`, `3004`, `3005`, `3006`, `3007`, `5433`, `6380`, `8080`, `9000`, `9001`

### Start the platform

```bash
git clone https://github.com/rajkrishnamurthy/gigachad-grc.git
cd gigachad-grc
./scripts/start-demo.sh          # same as: npm run demo
```

`scripts/start-demo.sh` is the supported way to run GigaChad GRC locally. The first run installs dependencies and takes a few minutes; subsequent starts finish in well under a minute, because dependencies and build output are reused. It performs eight steps:

1. Checks prerequisites (Docker, Compose v2, Node.js 18+, npm) and that every required host port is free, naming any conflict instead of failing halfway.
2. Creates `.env` from `env.development` if it is missing, and refuses to continue when `.env` sets `NODE_ENV=production`.
3. Starts infrastructure in Docker — `docker compose up -d postgres redis keycloak minio` — then waits for PostgreSQL and for the Keycloak realm to import.
4. Creates the database schema with `prisma db push` against `services/shared/prisma/schema.prisma`, then applies `database/dev-bootstrap.sql`.
5. Runs `npm install` if `node_modules` is absent, then builds the shared library and the six services in parallel.
6. Starts the six NestJS services on the host and waits for each port to accept connections.
7. Loads demo data on first run, and skips it when data is already present.
8. Starts the Vite dev server on port 3000 and opens your browser.

Per-process logs are written to `.demo/logs/`.

### Signing in

Open **http://localhost:3000** and click **Dev Login (Skip SSO)**. No password is needed; you are signed in as an admin of the demo organization.

Use `localhost`, not `127.0.0.1`. The Keycloak client in `auth/realm-export.json` allows only `http://localhost:3000/*` as a redirect URI, so `127.0.0.1` lands on a Keycloak "invalid redirect uri" page.

> ⚠️ **The development stack has no authentication.**
>
> In development every controller uses `DevAuthGuard`, which fabricates a full-permission admin user from any request and never validates a token. The genuine JWKS-validating `JwtAuthGuard` in `services/shared/src/auth/jwt.guard.ts` is currently wired to zero controllers. Keep the demo bound to loopback, and never expose it to a network or the internet.
>
> The Dev Login button is gated on Vite's `import.meta.env.DEV`, not on `VITE_ENABLE_DEV_AUTH` — that variable exists only to make production builds fail loudly. Setting it will not change dev login behaviour either way.

### Options

```bash
./scripts/start-demo.sh --skip-build     # reuse the existing dist/ output
./scripts/start-demo.sh --no-seed        # start without loading demo data
./scripts/start-demo.sh --no-browser     # do not open a browser
./scripts/start-demo.sh --help
```

### Stopping

```bash
./scripts/stop-demo.sh           # stop host processes and containers, keep data (npm run demo:stop)
./scripts/stop-demo.sh --clean   # also drop the PostgreSQL, Redis and MinIO volumes
./scripts/stop-demo.sh --purge   # --clean, plus remove .env, .demo/ and build output
```

`Ctrl+C` in the `start-demo.sh` terminal stops the host processes but leaves the containers running — run `stop-demo.sh` to stop those too. `npm run demo:reset` is `stop-demo.sh --clean` followed by a fresh start, i.e. an empty database and freshly seeded demo data.

### Architecture at runtime

The demo splits the stack in two:

| Runs in Docker | Runs on the host |
|----------------|------------------|
| PostgreSQL, Redis, Keycloak, MinIO | The six NestJS services and the Vite dev server |

`env.development` is written for exactly this layout: `DATABASE_URL`, `REDIS_URL`, `MINIO_ENDPOINT` and `KEYCLOAK_URL` all point at `localhost` and the published container ports.

Why not containerise the services as well? `docker-compose.yml` can build all six, but the first build of those images takes roughly 25-60 minutes, while compiling them on the host takes seconds. The host is the fast path for day-to-day work.

Keycloak is required even though the demo signs in with Dev Login: `frontend/src/contexts/AuthContext.tsx` calls `keycloak.init({ onLoad: 'check-sso' })` on every page load, and with Keycloak down the browser fails with `ERR_CONNECTION_REFUSED` before the login screen renders.

**Keycloak has its own database.** Its realm, clients and users live in a dedicated `keycloak` database, created on first volume initialisation by `database/bootstrap/00-create-keycloak-db.sql` and wired up through `KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak` in `docker-compose.yml`. It used to share the application database, which put its ~90 tables (`user_entity`, `redirect_uris`, …) into the same `public` schema Prisma manages; Prisma treated them as foreign, so every `prisma db push` offered to drop them — taking the realm and its users with it. With the split, `db push` only ever sees tables it owns.

**Running the full container stack.** `docker-compose.yml` holds the complete topology — the six services plus Traefik, Prometheus and Grafana. The images do not create the database schema, so it has to exist first:

```bash
cp env.development .env
npm install                 # provides the Prisma CLI used by db:push
docker compose up -d postgres
npm run db:push             # create the schema in the running PostgreSQL container
docker compose up -d        # build and start everything else (first build is slow)
```

`docker-compose.dev.yml` is stale and unused: it references `services/integrations`, `services/mcp` and `frontend/Dockerfile.dev`, none of which exist in this repository.

### Environment templates

| File | Purpose |
|------|---------|
| `env.development` | Local development and the demo. `start-demo.sh` copies it to `.env`. |
| `deploy/env.example` | Template used by the deployment tooling; sets `NODE_ENV=production`. |
| `env.example.production` | Production reference covering every supported variable. |

There is no `env.example` at the repository root. Do not copy a production template to `.env` for local work: `DevAuthGuard` throws when `NODE_ENV=production`, so every controls endpoint answers HTTP 500 rather than 401. `start-demo.sh` detects that `.env` and stops with instructions.

### Database and demo data

The schema is owned by Prisma (`services/shared/prisma/schema.prisma`, 129 models):

```bash
npm run db:push      # prisma db push --schema=services/shared/prisma/schema.prisma
npm run db:studio    # browse the data in Prisma Studio
```

The repository ships no baseline migration, so `prisma migrate deploy` has nothing to apply — use `db:push`. `database/init/*.sql` is legacy and **not** applied: those files are incremental patches against Prisma-owned tables, and are deliberately not mounted into the PostgreSQL container. `database/dev-bootstrap.sql` inserts the organization and user that `DevAuthGuard` hard-codes; without those rows the demo seeder fails with Prisma error `P2025`.

`start-demo.sh` loads demo data automatically on first run. To load it by hand:

```bash
curl -X POST http://localhost:3001/api/seed/load-demo
```

…or load it from the UI. Re-running it returns HTTP 409 once the organization holds data — reset from **Settings → Organization → Demo Data** first. All endpoints are throttled at 5 req/s, 30 req/10s and 100 req/min. It creates about a thousand records. Fixed every run: 3 frameworks (SOC 2 Type II, ISO 27001:2022, HIPAA), 276 framework requirements, 49 controls with 49 implementations, 20 evidence items, 15 policies, 20 vendors, 25 risks, 50 employees, 37 assets, 10 integrations and 5 audits. Control mappings, evidence links, vendor assessments, training records and background checks are randomised per run, so the grand total moves by a few dozen records each time.

### Health checks

Only the controls service exposes a health route:

```bash
curl http://localhost:3001/api/system/health    # {"status":"healthy",...}
```

The other five services do not — the shared `HealthModule` is not wired into them, so `/health` and `/api/health` return 404. Readiness for those is a TCP check on their port, which is what `start-demo.sh` does.

### Working on a single service

```bash
npm install                                    # once, workspace-wide
npm run build:shared                           # services/* import @gigachad-grc/shared from dist/
npm --prefix services/controls run start:dev   # watch mode on port 3001
npm --prefix frontend run dev                  # Vite on port 3000 (set in frontend/vite.config.ts)
```

Build every backend at once with `npm run build:services`. Infrastructure still has to be up: `docker compose up -d postgres redis keycloak minio`.

### Troubleshooting

- **`Ports already in use`** — a previous run or another app owns a port. Run `./scripts/stop-demo.sh`, or identify the owner with `lsof -nP -iTCP:3000 -sTCP:LISTEN`.
- **Every API call returns HTTP 500** — your `.env` sets `NODE_ENV=production`, which disables development auth. Replace it with a copy of `env.development`.
- **Keycloak shows "invalid redirect uri"** — open `http://localhost:3000`, never `http://127.0.0.1:3000`.
- **The login page never renders (`ERR_CONNECTION_REFUSED`)** — Keycloak is down; it is required even for Dev Login. Check `docker compose logs keycloak`.
- Anything else: **[Troubleshooting](docs/TROUBLESHOOTING.md)**.

## Production Readiness & Resilience

GigaChad GRC includes comprehensive built-in tools for ensuring production readiness:

### Production Validation CLI

Before deploying to production, run the validation script to check all configuration:

```bash
# Basic validation
npm run validate:production

# Strict mode (exit non-zero on warnings)
npm run validate:production:strict
```

The script validates:
- Security configuration (encryption keys, passwords, auth mode)
- Database connections and SSL
- Backup configuration
- Authentication setup (Keycloak)
- Network/CORS settings

### System Health Dashboard

Administrators can view real-time system health in **Settings > Organization Settings > System Health**:

- **System Health Banner**: Displays critical warnings for security issues, backup problems, and misconfigurations
- **Production Readiness Score**: 0-100 score indicating deployment readiness
- **Setup Wizard**: Guided configuration for new installations

### Automatic Features

When running with Docker, the entrypoint script provides:

| Feature | Environment Variable | Description |
|---------|---------------------|-------------|
| Auto-backup scheduling | `AUTO_BACKUP_ENABLED=true` | Schedules daily backups via cron |
| Database migrations | `AUTO_MIGRATE=true` (default) | Runs `prisma migrate deploy` on startup. The repository ships no migration files, so this applies nothing — create the schema with `npm run db:push` |
| Dependency wait | `WAIT_FOR_DB=true` | Waits for PostgreSQL before starting |
| Config warnings | Always enabled | Logs warnings for production misconfigurations |

### Data Persistence

All critical data is stored in Docker named volumes that survive container restarts:

| Data Type | Volume | Survives Crash |
|-----------|--------|----------------|
| Database | `postgres_data` | ✅ Yes |
| Evidence Files | `minio_data` | ✅ Yes |
| Cache/Sessions | `redis_data` | ✅ Yes |
| Metrics | `prometheus_data` | ✅ Yes |

**Important**: Running `./scripts/stop-demo.sh --clean` will delete volumes. Always run backups before maintenance.

### Backup & Restore

```bash
# Create backup (stored in /backups/gigachad-grc/)
npm run backup

# Restore from backup
npm run restore /path/to/backup.tar.gz
```

For detailed resilience documentation, see [System Health Guide](docs/help/admin/system-health.md).

## Project Structure

```
gigachad-grc/
├── services/
│   ├── shared/               # Shared TypeScript library
│   │   ├── src/
│   │   │   ├── types/        # Type definitions
│   │   │   ├── auth/         # Auth middleware
│   │   │   ├── storage/      # Storage abstraction
│   │   │   ├── events/       # Event bus
│   │   │   ├── utils/        # Utilities
│   │   │   └── logger/       # Logging
│   │   └── prisma/           # Unified database schema (all modules)
│   │       └── schema.prisma # Single source of truth
│   │
│   ├── controls/             # Controls + Evidence + Audit Logging
│   │   ├── src/
│   │   │   ├── controls/     # Control management
│   │   │   ├── evidence/     # Evidence library
│   │   │   ├── audit/        # Activity audit logging
│   │   │   └── testing/      # Control testing
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── frameworks/           # Frameworks + Risk Management
│   │   ├── src/
│   │   │   ├── frameworks/   # Framework assessments
│   │   │   ├── risks/        # Risk register
│   │   │   ├── scenarios/    # Risk scenarios
│   │   │   └── treatments/   # Risk treatments
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── policies/             # Policy Lifecycle Management
│   │   ├── src/
│   │   │   ├── policies/     # Policy CRUD
│   │   │   ├── versions/     # Version control
│   │   │   └── approvals/    # Approval workflows
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── tprm/                 # Third-Party Risk Management
│   │   ├── src/
│   │   │   ├── vendors/      # Vendor management
│   │   │   ├── assessments/  # Security assessments
│   │   │   └── contracts/    # Contract lifecycle
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── trust/                # Trust & Transparency
│   │   ├── src/
│   │   │   ├── questionnaires/  # Security questionnaires
│   │   │   ├── knowledge-base/  # Q&A repository
│   │   │   └── trust-center/    # Public trust portal
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── audit/                # Audit Management
│       ├── src/
│       │   ├── audits/       # Audit orchestration
│       │   ├── requests/     # Evidence requests
│       │   ├── findings/     # Audit findings
│       │   ├── evidence/     # Audit evidence
│       │   ├── portal/       # External auditor portal
│       │   └── fieldguide/   # FieldGuide integration
│       ├── Dockerfile
│       └── package.json
│
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── pages/            # Page components
│   │   │   ├── Controls.tsx
│   │   │   ├── Frameworks.tsx
│   │   │   ├── Risks.tsx
│   │   │   ├── Vendors.tsx
│   │   │   ├── Questionnaires.tsx
│   │   │   ├── Audits.tsx
│   │   │   └── ...
│   │   ├── components/       # Reusable components
│   │   ├── contexts/         # React contexts (Auth)
│   │   └── lib/              # Utilities and API clients
│   └── package.json
│
├── auth/                     # Keycloak configuration
│   └── realm-export.json     # Pre-configured realm
│
├── gateway/                  # Traefik configuration
│   └── traefik.yml
│
├── database/
│   ├── dev-bootstrap.sql     # Dev organization + user rows (applied by start-demo.sh)
│   └── init/                 # Legacy SQL patches - not applied, kept for history
│
├── scripts/
│   ├── start-demo.sh         # One-command local demo
│   └── stop-demo.sh          # Tear the demo down
│
├── docker-compose.yml        # Full container stack (infra + services + monitoring)
├── docker-compose.dev.yml    # Stale override, unused (references removed services)
├── env.development           # Development environment template
├── env.example.production    # Production environment template
└── README.md                 # This file
```

## Service Ports & Documentation

One authoritative list of host ports. Each backend service serves Swagger at `/api/docs`.

| Service | Host port | Started by the demo | Notes |
|---------|-----------|---------------------|-------|
| **Frontend** | 3000 | ✅ | Vite dev server — open http://localhost:3000 |
| **Controls** | 3001 | ✅ | http://localhost:3001/api/docs — controls, evidence, risks, assets, dashboards, users, AI/MCP |
| **Frameworks** | 3002 | ✅ | http://localhost:3002/api/docs |
| **Policies** | 3004 | ✅ | http://localhost:3004/api/docs |
| **TPRM** | 3005 | ✅ | http://localhost:3005/api/docs |
| **Trust** | 3006 | ✅ | http://localhost:3006/api/docs |
| **Audit** | 3007 | ✅ | http://localhost:3007/api/docs |
| **PostgreSQL** | 5433 | ✅ | Container listens on 5432 |
| **Redis** | 6380 | ✅ | Container listens on 6379 |
| **Keycloak** | 8080 | ✅ | Admin console; `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` from `.env` (`admin` / `admin` in `env.development`) |
| **MinIO API** | 9000 | ✅ | S3-compatible object storage |
| **MinIO Console** | 9001 | ✅ | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` from `.env`; `start-demo.sh` prints both when it finishes |
| **Traefik** | 80 / 443, dashboard 8090 | ❌ | Full container stack only |
| **Prometheus** | 9090 | ❌ | Full container stack only |
| **Grafana** | 3003 | ❌ | Container port 3000 published on 3003 |

**There is no service on port 3003.** Backend ports are 3001, 3002 and 3004-3007; 3003 belongs to Grafana in `docker-compose.yml`.

### Which service owns which route

The Vite dev server proxies each `/api/*` prefix to its owning service (`frontend/vite.config.ts`). Evidence is served by the **controls** service, not a service of its own.

| Service | Port | `/api` prefixes |
|---------|------|-----------------|
| **Controls** | 3001 | `/api/controls` `/api/evidence` `/api/implementations` `/api/dashboard` `/api/dashboards` `/api/comments` `/api/tasks` `/api/integrations` `/api/notifications` `/api/users` `/api/permissions` `/api/risks` `/api/assets` `/api/risk-config` `/api/risk-scenarios` `/api/seed` `/api/employee-compliance` `/api/notifications-config` `/api/training` `/api/ai` `/api/mcp` `/api/system` `/api/bulk` `/api/modules` `/api/config-as-code` `/api/workspaces` `/api/frameworks/catalog` `/api/audit` |
| **Frameworks** | 3002 | `/api/frameworks` `/api/assessments` `/api/mappings` |
| **Policies** | 3004 | `/api/policies` |
| **TPRM** | 3005 | `/api/vendors` `/api/contracts` `/api/vendor-assessments` `/api/tprm-config` (the proxy strips the `/api` prefix; internal routes are `/vendors` etc.) |
| **Trust** | 3006 | `/api/questionnaires` `/api/knowledge-base` `/api/trust-center` `/api/trust-config` `/api/answer-templates` `/api/trust-ai` (also served with the `/api` prefix stripped) |
| **Audit** | 3007 | `/api/audits` `/api/audit-requests` `/api/findings` `/api/audit/templates` `/api/audit/workpapers` `/api/audit/test-procedures` `/api/audit/remediation` `/api/audit/analytics` `/api/audit/planning` `/api/audit/reports` `/api/audit/audit-ai` |

Note the split around audit: `/api/audit` (activity audit logging) belongs to controls, while `/api/audits` and `/api/audit/*` belong to the audit service.

## Configuration

### Environment Variables

Defaults below are the fallbacks in `docker-compose.yml`. **None of these fallbacks are what the demo runs with** — `env.development` overrides every password with a generated value, so read your `.env` for the credentials actually in effect.

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Runtime mode; `production` disables development auth | development |
| `POSTGRES_USER` | Database user | grc |
| `POSTGRES_PASSWORD` | Database password | grc_secret |
| `POSTGRES_DB` | Database name | gigachad_grc |
| `REDIS_PASSWORD` | Redis password | redis_secret |
| `KEYCLOAK_ADMIN` | Keycloak admin user | admin |
| `KEYCLOAK_ADMIN_PASSWORD` | Keycloak admin password | admin |
| `KEYCLOAK_REALM` | Realm imported from `auth/realm-export.json` | gigachad-grc |
| `MINIO_ROOT_USER` | MinIO root user | minioadmin |
| `MINIO_ROOT_PASSWORD` | MinIO root password | minioadmin |
| `STORAGE_TYPE` | Storage backend (local/minio) | minio |

The frontend clients are `grc-frontend` (SPA) and `grc-services` (backend), both in realm `gigachad-grc`.

### Storage Configuration

The platform supports multiple storage backends:

**Local Storage:**
```env
STORAGE_TYPE=local
LOCAL_STORAGE_PATH=./storage
```

**MinIO/S3:**
```env
STORAGE_TYPE=minio
# Use `minio` when the service runs in Docker, `localhost` when it runs on the host
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=<the MINIO_ROOT_PASSWORD from your .env>
MINIO_BUCKET=grc-evidence
```

## Module Extraction

Each service is designed to run independently. To extract a module:

1. Copy the service directory
2. Update the `DATABASE_URL` in the service's environment
3. Create the schema: `npx prisma db push --schema=../shared/prisma/schema.prisma` (the schema is shared and there is no baseline migration, so `migrate deploy` has nothing to apply)
4. Build and run: `docker build -t my-service . && docker run my-service`

## Security Considerations

> ⚠️ **The development configuration has no authentication at all.** Every controller is bound to `DevAuthGuard`, which fabricates a full-permission admin user from any request without validating a token. The real JWKS-validating `JwtAuthGuard` (`services/shared/src/auth/jwt.guard.ts`) is wired to zero controllers today. A development instance must stay on loopback and must never be exposed to a network.

Before running anywhere but your own machine:

- Change every password and secret from the shipped development values
- Wire `JwtAuthGuard` (or your own guard) into the controllers and stop using `DevAuthGuard`
- Enable TLS/SSL for all services
- Configure Keycloak for production use
- Use proper secrets management
- Review and harden Docker images

`npm run validate:production` checks configuration before a production deploy; see [Production Readiness & Resilience](#production-readiness--resilience).

## License

This project is licensed under the **Elastic License 2.0 (ELv2)**.

### What You CAN Do:
- Use internally at your company for commercial purposes
- Modify the software for your own use
- Self-host on your own infrastructure
- Contribute improvements back to the project

### What You CANNOT Do:
- Offer this software as a hosted/managed service to third parties
- Sell the software or derivatives to others
- Create a competing commercial GRC product based on this code
- Remove or obscure license/copyright notices

See the [LICENSE](LICENSE) file for the complete license terms.

For commercial licensing inquiries (e.g., to offer as a managed service), please contact the project maintainers.

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) to get started.

By contributing, you agree that your contributions will be licensed under the same Elastic License 2.0. Please also review our [Code of Conduct](CODE_OF_CONDUCT.md).

**Quick Start:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following our [coding standards](CONTRIBUTING.md#coding-standards)
4. Run the tests for the services you touched (e.g. `npm --prefix services/controls run test`) — see the [Contributing Guide](CONTRIBUTING.md)
5. Submit a pull request

## Support

- **Documentation**: Check the [docs folder](./docs) for guides and references
- **Issues**: Use the [GitHub issue tracker](../../issues) for bugs and feature requests
- **Security**: Report vulnerabilities privately via [GitHub Security Advisories](../../security/advisories/new)
- **Discussions**: Use [GitHub Discussions](../../discussions) for questions and ideas




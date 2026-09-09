# GigaChad GRC - Development Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Project Structure](#project-structure)
4. [Local Development](#local-development)
5. [Frontend Development](#frontend-development)
6. [Backend Development](#backend-development)
7. [Database Management](#database-management)
8. [Testing](#testing)
9. [Debugging](#debugging)
10. [Code Style](#code-style)
11. [Git Workflow](#git-workflow)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 20.x LTS | Runtime for services and frontend |
| npm | 10.x | Package management |
| Docker | 24.x+ | Container runtime |
| Docker Compose | 2.x | Container orchestration |
| Git | 2.x | Version control |

### Optional but Recommended

| Software | Purpose |
|----------|---------|
| VS Code | IDE with recommended extensions |
| Postman/Insomnia | API testing |
| TablePlus/DBeaver | Database GUI |

### VS Code Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "prisma.prisma",
    "bradlc.vscode-tailwindcss",
    "ms-azuretools.vscode-docker",
    "eamodio.gitlens",
    "streetsidesoftware.code-spell-checker"
  ]
}
```

---

## Quick Start

### 1. Clone and Setup

```bash
# Clone repository
git clone https://github.com/rajkrishnamurthy/gigachad-grc.git
cd gigachad-grc

# Copy the development environment file
cp env.development .env

# Install root dependencies
npm install
```

> ⚠️ `deploy/env.example` is the **production** template — it sets
> `NODE_ENV=production`, which makes `DevAuthGuard` throw so every controls
> endpoint answers HTTP 500. Never copy it to `.env` for local development.
> There is no `env.example` at the repository root.

### 2. Start Infrastructure

```bash
# Start all services
docker compose up -d

# Wait for services to be healthy
docker compose ps

# Verify all services are running
./deploy/preflight-check.sh
```

### 3. Initialize Database

```bash
# One shared Prisma schema covers all six services
npm run db:push

# Insert the organization and user DevAuthGuard hard-codes
docker compose exec -T postgres \
  psql -U grc -d gigachad_grc < database/dev-bootstrap.sql
```

The repository ships no baseline migration, so `prisma migrate dev` and
`prisma migrate deploy` have nothing to apply — `db push` is the supported way
to create the schema. Without the `dev-bootstrap.sql` rows the demo seeder fails
with Prisma error `P2025`.

```bash
# Load demo data (optional)
curl -X POST http://localhost:3001/api/seed/load-demo
```

That route returns HTTP 409 once the organization holds data; reset it from
**Settings → Organization → Demo Data** first. `scripts/seed-database.ts` is
legacy and non-functional.

`./scripts/start-demo.sh` does all of the above (env file, schema, bootstrap
rows, services, frontend, demo data) in one command.

### 4. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. Access Application

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Click **Dev Login** |
| Traefik Dashboard | http://localhost:8090 | - |
| Keycloak Admin | http://localhost:8080 | admin / admin |
| MinIO Console | http://localhost:9001 | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` from `.env` |
| PostgreSQL | localhost:5433 | `POSTGRES_USER` / `POSTGRES_PASSWORD` from `.env` |

Open `http://localhost:3000`, not `127.0.0.1:3000` — only `localhost` is in
Keycloak's redirect allow-list (`auth/realm-export.json`). Port 3000 is the Vite
dev server port for this project.

---

## Project Structure

```
gigachad-grc/
├── auth/                      # Keycloak configuration
│   └── realm-export.json      # Realm export file
│
├── database/                  # Database SQL
│   ├── dev-bootstrap.sql      # Dev organization/user DevAuthGuard requires
│   ├── bootstrap/             # Mounted into Postgres on first start
│   │   └── 00-create-keycloak-db.sql
│   └── init/                  # Legacy patches — NOT mounted, not applied
│
├── deploy/                    # Deployment files
│   ├── env.example           # PRODUCTION template (sets NODE_ENV=production)
│   ├── preflight-check.sh    # Pre-deployment checks
│   ├── db-migrate.sh         # Database migration script
│   ├── backup.sh             # Backup script
│   ├── restore.sh            # Restore script
│   └── monitoring/           # Monitoring configuration
│       ├── prometheus.yml
│       ├── alerts.yml
│       └── docker-compose.monitoring.yml
│
├── docs/                      # Documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── CONFIGURATION.md
│   ├── DEPLOYMENT.md
│   └── DEVELOPMENT.md
│
├── frontend/                  # React frontend
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/           # Page components
│   │   ├── contexts/        # React contexts
│   │   ├── hooks/           # Custom hooks
│   │   ├── lib/             # Utilities
│   │   └── App.tsx          # Main app
│   ├── public/              # Static assets
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── gateway/                   # API Gateway
│   └── traefik.yml           # Traefik configuration
│
├── scripts/                   # Utility scripts
│   ├── start-demo.sh         # One-command local demo
│   ├── stop-demo.sh          # Teardown (--clean, --purge)
│   ├── seed-database.ts      # Legacy, non-functional (no database/seeds/)
│   └── import-*.ts           # Data import scripts
│
├── services/                  # Backend microservices
│   ├── shared/               # Shared libraries
│   │   ├── prisma/
│   │   │   └── schema.prisma # The single schema for all services (129 models)
│   │   └── src/
│   │       ├── auth/         # Auth utilities
│   │       ├── cache/        # Caching
│   │       ├── filters/      # Exception filters
│   │       ├── health/       # Health checks
│   │       ├── middleware/   # Middleware
│   │       └── prisma/       # Prisma module
│   │
│   ├── controls/             # Controls service
│   │   ├── src/
│   │   │   ├── controls/    # Controls module
│   │   │   ├── evidence/    # Evidence module
│   │   │   ├── assets/      # Assets module
│   │   │   └── main.ts
│   │   ├── prisma/
│   │   │   └── migrations/  # Service-local migration (schema lives in shared/)
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── frameworks/           # Frameworks service
│   ├── policies/             # Policies service
│   ├── tprm/                 # TPRM service
│   ├── trust/                # Trust service
│   └── audit/                # Audit service
│
├── terraform/                 # Infrastructure as Code
│   └── modules/              # Terraform modules
│
├── docker-compose.yml         # Development compose
├── docker-compose.dev.yml     # Dev overrides
├── docker-compose.prod.yml    # Production compose
├── env.development            # Local development / demo template
├── env.example.production     # Production reference
├── package.json               # Root package.json
└── README.md
```

---

## Local Development

### Development Mode

```bash
# Start infrastructure only
docker compose up -d postgres keycloak minio traefik

# Build the shared library first — every service imports @gigachad-grc/shared
npm run build:shared

# Start services in watch mode (separate terminals)
cd services/controls && npm run start:dev      # :3001
cd services/frameworks && npm run start:dev    # :3002
# ... policies :3004, tprm :3005, trust :3006, audit :3007

# Start frontend (Vite dev server on :3000)
cd frontend && npm run dev
```

### Hot Reloading

- **Frontend**: Vite HMR (automatic)
- **Backend**: NestJS watch mode (`npm run start:dev`)
- **Database**: Prisma Studio (`npm run db:studio`)

### Environment Overrides

`.env` is gitignored, so edit it directly and restart the affected services —
nothing in this project reads `.env.local` for backend variables:

```bash
# .env
LOG_LEVEL=debug
RATE_LIMIT_ENABLED=false
```

Frontend `VITE_*` variables can also go in `frontend/.env.local`, which Vite
reads. Leave `VITE_API_URL` empty in development so the Vite dev server proxies
each `/api/*` prefix to the service that owns it (`frontend/vite.config.ts`).

---

## Frontend Development

### Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Styling**: TailwindCSS
- **State**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod
- **Routing**: React Router v6
- **UI Components**: Headless UI

### Commands

```bash
cd frontend

# Development server
npm run dev

# Type checking (tsc, then build)
npm run build:typecheck

# Linting
npm run lint

# Build
npm run build

# Preview production build
npm run preview
```

### Adding a New Page

1. Create page component in `src/pages/`:

```tsx
// src/pages/NewFeature.tsx
import { useQuery } from '@tanstack/react-query';
import { featureApi } from '@/lib/api';

export default function NewFeature() {
  const { data, isLoading } = useQuery({
    queryKey: ['features'],
    queryFn: () => featureApi.list(),
  });

  if (isLoading) return <SkeletonGrid />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New Feature</h1>
      {/* Content */}
    </div>
  );
}
```

2. Add route in `src/App.tsx`:

```tsx
<Route path="new-feature" element={<NewFeature />} />
```

3. Add navigation in `src/components/Layout.tsx`:

```tsx
{ name: 'New Feature', href: '/new-feature', icon: FeatureIcon }
```

### Component Guidelines

```tsx
// Use named exports for components
export function MyComponent() {}

// Use default export for pages
export default function MyPage() {}

// Use proper TypeScript types
interface MyComponentProps {
  title: string;
  onAction?: () => void;
}

// Use composition over inheritance
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
</Card>
```

---

## Backend Development

### Stack

- **Framework**: NestJS 10
- **ORM**: Prisma
- **Validation**: class-validator
- **Documentation**: Swagger/OpenAPI

### Service Structure

```
services/controls/
├── src/
│   ├── main.ts              # Bootstrap
│   ├── app.module.ts        # Root module
│   │
│   ├── controls/            # Feature module
│   │   ├── controls.module.ts
│   │   ├── controls.controller.ts
│   │   ├── controls.service.ts
│   │   ├── dto/
│   │   │   ├── create-control.dto.ts
│   │   │   └── update-control.dto.ts
│   │   └── entities/
│   │       └── control.entity.ts
│   │
│   └── prisma/
│       └── prisma.module.ts
│
├── prisma/
│   └── migrations/         # Service-local migrations only — the schema is
│                           # services/shared/prisma/schema.prisma
│
├── package.json
├── tsconfig.json
└── Dockerfile
```

### Creating a New Module

```bash
cd services/controls

# Generate module, controller, service
nest g module features/new-feature
nest g controller features/new-feature
nest g service features/new-feature
```

### DTO Validation

```typescript
// src/new-feature/dto/create-new-feature.dto.ts
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateNewFeatureDto {
  @ApiProperty({ description: 'Feature title' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Feature description', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;
}
```

### Service Pattern

```typescript
// src/new-feature/new-feature.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NewFeatureService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: { skip?: number; take?: number }) {
    return this.prisma.newFeature.findMany({
      skip: params.skip,
      take: params.take,
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const feature = await this.prisma.newFeature.findFirst({
      where: { id, deletedAt: null },
    });
    
    if (!feature) {
      throw new NotFoundException(`Feature ${id} not found`);
    }
    
    return feature;
  }

  async create(data: CreateNewFeatureDto, userId: string) {
    return this.prisma.newFeature.create({
      data: {
        ...data,
        createdBy: userId,
      },
    });
  }
}
```

---

## Database Management

### Prisma Commands

All commands run from the repository root against the one shared schema,
`services/shared/prisma/schema.prisma`:

```bash
# Push the schema to the database (creates/updates every table)
npm run db:push

# Browse the data
npm run db:studio

# Generate Prisma Client (output: node_modules/.prisma/client)
npx prisma generate --schema=services/shared/prisma/schema.prisma

# Start over: drop the volumes, then let the demo script recreate everything
./scripts/stop-demo.sh --clean && ./scripts/start-demo.sh
```

> The project has **no migration baseline** — `services/shared/prisma/migrations`
> holds a single incremental migration against 129 models — so `prisma migrate dev`,
> `prisma migrate deploy` and `prisma migrate reset` cannot build this database.
> Schema changes are applied with `db push`.

### Schema Changes

1. Modify `services/shared/prisma/schema.prisma`
2. Apply it: `npm run db:push`
3. Generate client: `npx prisma generate --schema=services/shared/prisma/schema.prisma`
4. Rebuild the shared library if types changed: `npm run build:shared`
5. Restart the affected services

### Common Patterns

```prisma
// Soft delete
model Control {
  id        String    @id @default(uuid())
  deletedAt DateTime?
  deletedBy String?
  
  @@index([deletedAt])
}

// Audit fields
model Policy {
  createdAt DateTime @default(now())
  createdBy String
  updatedAt DateTime @updatedAt
  updatedBy String?
}

// Relations
model Evidence {
  control   Control @relation(fields: [controlId], references: [id])
  controlId String
}
```

---

## Testing

### Frontend Testing

```bash
cd frontend

# Watch mode
npm test

# Single run
npm run test:run

# Coverage
npm run test:coverage

# End-to-end (Playwright, needs the stack running)
npm run test:e2e
```

### Backend Testing

```bash
cd services/controls

# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov
```

### Test Patterns

```typescript
// Unit test
describe('ControlsService', () => {
  let service: ControlsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ControlsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ControlsService>(ControlsService);
  });

  it('should create a control', async () => {
    const result = await service.create(mockData, 'user-id');
    expect(result.title).toBe(mockData.title);
  });
});
```

---

## Debugging

### VS Code Launch Configuration

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Controls Service",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "restart": true,
      "sourceMaps": true
    },
    {
      "name": "Debug Frontend",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000",
      "webRoot": "${workspaceFolder}/frontend/src"
    }
  ]
}
```

### Enable Debug Mode

```bash
# Start service with debugging
cd services/controls
npm run start:debug
```

### Logging

```typescript
import { Logger } from '@nestjs/common';

@Injectable()
export class MyService {
  private readonly logger = new Logger(MyService.name);

  async process() {
    this.logger.debug('Processing started');
    this.logger.log('Processing complete');
    this.logger.warn('Unexpected condition');
    this.logger.error('Operation failed', error.stack);
  }
}
```

### Database Queries

```bash
# Log all SQL queries
DATABASE_URL="postgresql://...?debug=true"

# Or in Prisma
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

---

## Code Style

### ESLint Configuration

```javascript
// .eslintrc.js
module.exports = {
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    'react/react-in-jsx-scope': 'off',
  },
};
```

### Prettier Configuration

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

### Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `ControlCard.tsx` |
| Hooks | camelCase with use | `useControls.ts` |
| Utils | camelCase | `formatDate.ts` |
| Constants | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |
| Types/Interfaces | PascalCase | `ControlData` |
| Database tables | snake_case | `audit_logs` |

---

## Git Workflow

### Branch Strategy

```
main          # Production-ready code
├── develop   # Integration branch
│   ├── feature/add-export     # Feature branches
│   ├── feature/risk-scoring
│   └── fix/evidence-upload
└── release/v1.2.0             # Release branches
```

### Commit Messages

Follow Conventional Commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

Examples:
```
feat(controls): add bulk import functionality
fix(evidence): resolve file upload timeout
docs(api): update authentication docs
refactor(risks): extract calculation service
```

### Pull Request Process

1. Create feature branch from `develop`
2. Make changes and commit
3. Push branch and create PR
4. Request review
5. Address feedback
6. Squash and merge

### Pre-commit Hooks

```bash
# Install husky
npm install husky lint-staged --save-dev

# Setup hooks
npx husky install
npx husky add .husky/pre-commit "npx lint-staged"
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

---

## Troubleshooting

### Common Issues

**Port already in use** (3000 frontend, 3001–3007 services, 5433 Postgres,
8080 Keycloak, 9000/9001 MinIO):
```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill -9 <PID>
```

**Docker issues**:
```bash
docker compose down -v
docker system prune -a
docker compose up -d --build
```

**HTTP 500 from every controls endpoint**: `.env` has `NODE_ENV=production`, so
`DevAuthGuard` throws. Replace it with `env.development`.

**Prisma issues**:
```bash
rm -rf node_modules/.prisma
npx prisma generate --schema=services/shared/prisma/schema.prisma
```

**Node modules issues**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Getting Help

- Check existing issues in GitHub
- Review documentation
- Ask in team Slack channel
- Create detailed bug report with:
  - Steps to reproduce
  - Expected behavior
  - Actual behavior
  - Environment details
  - Error logs






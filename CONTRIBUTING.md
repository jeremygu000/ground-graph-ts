# Contributing to GroundGraph TypeScript

Thank you for your interest in contributing to GroundGraph TypeScript!

## Code of Conduct

By participating in this project, you agree to abide by our code of conduct. We are committed to making participation in this project a harassment-free experience for everyone.

## Getting Started

### Prerequisites

- Node.js >= 22.0.0
- pnpm >= 9.0.0
- Docker and Docker Compose (for local infrastructure and testing)

### Development Setup

1. Fork the repository
2. Clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/ground-graph-ts.git
   cd ground-graph-ts
   ```

3. Install dependencies:

   ```bash
   pnpm install --frozen-lockfile
   ```

4. Start local infrastructure:

   ```bash
   docker-compose up -d
   ```

5. Run quality gates to ensure everything works:
   ```bash
   pnpm check
   ```

## Development Workflow

### 1. Create a Branch

Create a feature branch from `master`:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Changes

- Follow the existing code style and conventions
- Write clean, well-documented code
- Add/update tests as needed
- Run quality gates before committing

### 3. Quality Gates

All changes must pass the following checks:

```bash
# Format check
pnpm format:check

# Linting
pnpm lint

# Type checking
pnpm typecheck

# Unit tests with coverage
pnpm test:unit --coverage

# Component tests (requires Docker or another compatible container runtime)
pnpm test:component

# Main check gate
pnpm check
```

### 4. Commit Changes

Follow the commit message format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Example:

```
feat(ingestion): add support for markdown document parsing

- Add markdown parser adapter
- Implement heading-based chunking
- Add unit tests for parser

Closes #123
```

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Architecture Rules

GroundGraph follows strict clean architecture principles:

```
domain <- application <- workflows/API <- infrastructure composition
```

### Layer Constraints

1. **Domain** (`src/domain/`): May import only standard APIs and Zod
2. **Application** (`src/application/`): Owns ports, use cases, errors, transaction boundaries
3. **Workflows** (`src/workflows/`): Uses application services via LangGraph adapter
4. **Infrastructure** (`src/infrastructure/`): Implements application ports

### Critical Rules

1. Never commit secrets, tokens, credentials, or raw unrestricted document content
2. Domain/application code must not depend on Fastify, Drizzle, PostgreSQL, Neo4j, LangGraph, model SDKs, Testcontainers
3. TypeScript compile-time types do not replace runtime validation at external boundaries
4. PostgreSQL transactions belong to the application Unit of Work; repositories never commit independently
5. Access control is applied before retrieval results can enter model context

## Testing Guidelines

### Test Types

- **Unit tests**: No Docker/network; test domain and application logic
- **Architecture tests**: Verify layer boundary rules
- **Component tests**: Testcontainers for PostgreSQL, Neo4j, MinIO
- **Contract tests**: API contracts and provider interfaces
- **Stack tests**: Full docker-compose smoke tests
- **E2E tests**: End-to-end workflows
- **Adversarial tests**: Security testing

### Coverage Requirements

- Unit coverage thresholds:
  - Lines/statements/functions >= 85%
  - Branches >= 80%

### Running Tests

```bash
# Unit tests only
pnpm test:unit

# With coverage
pnpm test:unit --coverage

# Architecture tests
pnpm test:architecture

# Component tests (requires Docker or another compatible container runtime)
pnpm test:component
```

`pnpm test:component` fails clearly if no container runtime is available. It does not skip suites or report a false green result.

## Documentation

### Updating Documentation

- Update README.md if you add new features or change setup instructions
- Update AGENTS.md if you change development workflow
- Add ADRs for architectural decisions
- Add inline documentation for complex code

### ADR Guidelines

Architecture Decision Records (ADRs) should be placed in `docs/adr/` and include:

- Context
- Decision
- Alternatives
- Consequences
- Evidence
- Reversal path

## Pull Request Process

### PR Requirements

1. Pass all quality gates (format, lint, typecheck, tests)
2. Maintain or improve coverage
3. Update documentation as needed
4. Include meaningful commit messages
5. Address review feedback

### PR Description Template

```markdown
## Summary

Brief description of the change

## Motivation

Why is this change needed?

## Changes

- List of specific changes made

## Testing

How was this tested?

## Checklist

- [ ] Passes all quality gates
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No new warnings/errors
```

## Reporting Issues

When reporting issues, please include:

1. **Description**: Clear description of the issue
2. **Steps to reproduce**: How to reproduce the issue
3. **Expected behavior**: What you expected to happen
4. **Actual behavior**: What actually happened
5. **Environment**: Node version, OS, etc.
6. **Logs**: Relevant error logs or screenshots

## Questions?

Feel free to:

- Open an issue for questions
- Join discussions in pull requests
- Check existing issues and discussions before creating new ones

## License

By contributing to GroundGraph TypeScript, you agree that your contributions will be licensed under the Apache License, Version 2.0.

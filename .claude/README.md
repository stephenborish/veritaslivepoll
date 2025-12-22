# Claude Code Configuration

This directory contains configuration files for Claude Code, an AI-powered development assistant.

## Directory Structure

```
.claude/
├── README.md          # This file
├── prompts/           # Custom prompts for specific tasks
└── commands/          # Slash commands for common operations
```

## Custom Commands

Custom slash commands are defined in the `commands/` directory. Each command is a markdown file that contains a prompt that Claude will execute.

### Available Commands

- `/review-code` - Review code for security issues and best practices
- `/explain-architecture` - Explain the system architecture and agent interactions
- `/add-tests` - Add comprehensive tests for a specific component
- `/optimize-performance` - Analyze and suggest performance optimizations
- `/check-security` - Perform security audit on specified code

## Usage

To use a slash command, type it in your conversation with Claude:

```
/review-code src/Teacher_API.gs
```

Claude will execute the prompt defined in the corresponding command file.

## Creating Custom Commands

To create a new command:

1. Create a new `.md` file in `.claude/commands/`
2. Name it `your-command-name.md`
3. Write a clear prompt describing what Claude should do
4. Use the command with `/your-command-name`

### Example Command File

File: `.claude/commands/example.md`

```markdown
Analyze the specified file for:
1. Code quality issues
2. Potential bugs
3. Performance concerns
4. Security vulnerabilities

Provide specific recommendations with line numbers.
```

## Custom Prompts

The `prompts/` directory contains reusable prompts for common tasks specific to this project.

## Project Context

When working with Claude Code on this project, Claude has access to:
- All source code in `src/`
- Documentation in markdown files
- Architecture details in `ARCHITECTURE.md` and `AGENTS.md`
- The Google Apps Script runtime environment

## Best Practices

1. **Be Specific**: When asking Claude to modify code, reference specific files and functions
2. **Use Commands**: Leverage custom commands for repetitive tasks
3. **Review Changes**: Always review Claude's suggested changes before applying
4. **Incremental Changes**: Make small, focused changes and test frequently
5. **Security First**: Always consider security implications when modifying authentication or proctoring code

## Project-Specific Guidelines

### Authentication
- Teacher authentication uses email-based verification
- Student authentication uses HMAC-signed tokens
- Never log or expose tokens in error messages

### Proctoring
- Violation detection is client-side (browser events)
- Lock state persists across page reloads
- Version-based approvals prevent race conditions

### Performance
- Minimize Google Sheets operations (batch reads/writes)
- Use Script Properties for fast, frequently-accessed state
- Poll intervals default to 2.5 seconds (adjustable)

### Testing
- Use `Test_System.gs` for automated tests
- Use `DevTools.gs` for manual testing utilities
- Always test proctoring flow before deployment

## Resources

- [Claude Code Documentation](https://docs.anthropic.com/claude/docs)
- [Google Apps Script Reference](https://developers.google.com/apps-script)
- [Project Architecture](../ARCHITECTURE.md)
- [System Agents](../AGENTS.md)

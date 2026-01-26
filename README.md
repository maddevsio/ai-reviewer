# AI Code Review

AI-powered code review CLI tool for pull requests.

## Installation

```bash
npm install -g ai-code-review
```

## Development Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Link locally for testing
npm link

# Watch mode for development
npm run dev
```

## Usage

### Quick Start

Run the interactive setup wizard (recommended for first-time users):

```bash
ai-review init
```

This will guide you through:
1. Selecting your AI provider
2. Entering your API key
3. Choosing your git platform

### Manual Configuration

Alternatively, set up your configuration manually:

```bash
# Interactive provider selection
ai-review config set provider

# Interactive API key input with masking
ai-review config set api-key

# Or specify values directly
ai-review config set provider anthropic
ai-review config set api-key sk-ant-...
```

**Available providers:**
- ✅ `anthropic` (Claude) - Available now
- 🚧 `openai` (GPT-4) - Coming soon
- 🚧 `google` (Gemini) - Coming soon

View current configuration:

```bash
ai-review config list
```

### Review Pull Requests

Interactive mode (lists all open PRs):

```bash
ai-review pr
```

Review specific PR:

```bash
ai-review pr 342
```

Options:
- `--post` - Automatically post comments to the PR
- `--dry-run` - Show comments without posting

## Requirements

- Node.js 18+
- GitHub CLI (`gh`) installed and authenticated (for GitHub PRs)

Install GitHub CLI:

```bash
# macOS
brew install gh

# Authenticate
gh auth login
```

## Current Status

🚧 **Work in Progress** - MVP phase

**Implemented:**
- ✅ Configuration management
- ✅ CLI command structure
- ✅ Interactive UI demo

**Coming Soon:**
- GitHub integration via `gh` CLI
- AI provider implementations (Anthropic, OpenAI, Google)
- Full review workflow
- Comment posting

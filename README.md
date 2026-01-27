# AI Code Review

AI-powered code review CLI tool for pull requests. Get intelligent feedback on your code changes using Claude AI, with support for GitHub and more platforms coming soon.

## Features

- 🤖 **AI-Powered Reviews** - Leverages Claude AI to provide intelligent, context-aware code reviews
- 🔄 **Interactive Workflow** - Review, accept, edit, or skip each AI suggestion
- 💬 **Inline Comments** - Posts comments directly on specific lines in your PRs
- ✅ **PR Approval** - Approve PRs, request changes, or leave comments only
- 🎨 **Beautiful CLI** - Terminal-style diff colors and intuitive interface
- 🔒 **Secure** - API keys are masked and stored locally
- 🚀 **No Setup Demo** - Try it out with mock data before configuring

## Try It First (No Setup Required)

Experience the tool with mock data before setting up API keys:

```bash
ai-review demo
```

This will simulate a complete review workflow with example PRs.

## Installation

```bash
npm install -g ai-code-review
```

## Quick Start

### 1. Run Setup Wizard

```bash
ai-review init
```

This interactive wizard will guide you through:
1. Selecting your AI provider (Claude)
2. Entering your API key (input is masked)
3. Choosing your git platform (GitHub)

### 2. Get Your API Key

**Anthropic (Claude):**
- Visit https://console.anthropic.com/
- Go to API Keys section
- Create a new API key
- Copy and paste it into the setup wizard

### 3. Install & Authenticate GitHub CLI

**macOS:**
```bash
brew install gh
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install gh
```

**Windows:**
```bash
winget install --id GitHub.cli
```

**Authenticate:**
```bash
gh auth login
```

### 4. Review a Pull Request

**Interactive mode (lists all open PRs):**
```bash
ai-review pr
```

**Review specific PR:**
```bash
ai-review pr 342
```

**Auto-post accepted comments:**
```bash
ai-review pr 342 --post
```

**Preview comments without posting:**
```bash
ai-review pr 342 --dry-run
```

## Usage

### Configuration Commands

**Show all settings:**
```bash
ai-review config list
```

**Set AI provider (interactive):**
```bash
ai-review config set provider
```

**Set API key (interactive, masked input):**
```bash
ai-review config set api-key
```

**Set git platform (interactive):**
```bash
ai-review config set platform
```

**Get specific value:**
```bash
ai-review config get provider
```

**Delete a setting:**
```bash
ai-review config delete api-key
```

### Review Workflow

When you run `ai-review pr`, here's what happens:

1. **Fetch PR** - Retrieves PR details, diff, and file changes
2. **AI Analysis** - Sends code changes to Claude for review
3. **Interactive Review** - For each suggestion:
   - View code context with line numbers
   - Read AI's comment
   - Choose: Accept, Edit, Skip, or Quit
4. **Post Comments** - Confirm whether to post accepted comments
5. **PR Approval** (if comments pending):
   - **Approve PR** - Submit approval
   - **Request changes** - Requires summary message
   - **Comment only** - Post without approval status
   - **Skip** - Don't submit review

### PR Approval Options

After reviewing comments, you can:

- **Approve PR** - Mark PR as approved (requires confirmation)
- **Request changes** - Ask for specific changes (requires summary message + confirmation)
- **Comment only** - Post review comments without approval status
- **Skip** - Exit without taking action

All comments and approval status are submitted together in a single GitHub review.

## Requirements

- **Node.js** 18 or higher
- **GitHub CLI** (`gh`) installed and authenticated
- **Anthropic API Key** with sufficient credits

## Troubleshooting

### "GitHub CLI (gh) not found"

**Solution:** Install GitHub CLI for your platform:

**macOS:**
```bash
brew install gh
```

**Linux:**
```bash
sudo apt install gh  # or: sudo dnf install gh
```

**Windows:**
```bash
winget install --id GitHub.cli
```

### "GitHub CLI not authenticated"

**Solution:** Run authentication:
```bash
gh auth login
```
Follow the prompts to authenticate with GitHub.

### "Failed to submit review: Review You need to leave a comment"

**Cause:** GitHub requires a body message for REQUEST_CHANGES reviews.

**Solution:** When requesting changes, the tool will prompt you for a summary message. Make sure to provide one.

### "No pull requests found"

**Possible causes:**
- Not in a git repository
- No remote configured
- No open PRs in the repository
- Not authenticated with GitHub

**Solution:**

1. Ensure you're in a git repository:
```bash
git status
```

2. Check remote:
```bash
git remote -v
```

3. Verify authentication:
```bash
gh auth status
```

### API Rate Limiting

**Solution:** The tool uses the Anthropic API which has rate limits. If you hit limits:
- Wait a few minutes before retrying
- Check your API key limits in the Anthropic console
- Consider upgrading your API plan for higher limits

### "Cannot review own PR"

GitHub doesn't allow you to approve or request changes on your own PRs. You can still:
- Review the code
- Post comments
- Use the tool on PRs created by others

## FAQ

### Can I review my own PRs?

You can review and post comments on your own PRs, but GitHub prevents you from approving or requesting changes on PRs you created.

### What AI models are supported?

Currently, only Claude (Anthropic) is supported. OpenAI GPT-4 and Google Gemini support is planned for future releases.

### What git platforms are supported?

Currently, only GitHub is supported via the GitHub CLI (`gh`). GitLab and Bitbucket support is planned.

### How much does it cost?

The tool is free, but you need an Anthropic API key. API usage costs depend on:
- PR size (number of lines changed)
- Claude model used (defaults to Claude Sonnet 4.5)

Typical cost per review: $0.01-0.10 depending on PR size.

### Where is my configuration stored?

Configuration is stored locally at:
- macOS/Linux: `~/.config/ai-code-review-nodejs/config.json`
- Windows: `%APPDATA%\ai-code-review-nodejs\config.json`

API keys are stored in plain text locally. Keep your config directory secure.

### Can I customize the AI's review style?

Not yet, but configurable review strictness levels (relaxed, balanced, strict, pedantic) are planned for a future release.

### Does it work offline?

No, the tool requires:
- Internet connection
- Access to Anthropic API
- Access to GitHub (if reviewing GitHub PRs)

### What programming languages are supported?

The tool works with any programming language. Claude AI can review code in most popular languages including JavaScript, TypeScript, Python, Go, Rust, Java, C++, and many more.

## Current Status

✅ **MVP Complete** - Core features fully implemented

**Implemented:**
- ✅ Configuration management with interactive setup
- ✅ GitHub integration via `gh` CLI and Octokit API
- ✅ Anthropic (Claude) AI provider
- ✅ Full review workflow with interactive comment management
- ✅ Inline comment posting with line numbers
- ✅ PR approval/request changes workflow
- ✅ Demo mode with mock data
- ✅ Comprehensive CLI help

**Coming Soon:**
- GitLab support
- Bitbucket support
- Additional AI providers (OpenAI GPT-4, Google Gemini)
- Configurable review strictness levels
- Project-specific review guidelines (`.aireview` file)

## Development Setup

**Clone the repository:**
```bash
git clone https://github.com/YOUR_USERNAME/ai-code-review.git
cd ai-code-review
```

**Install dependencies:**
```bash
npm install
```

**Build the project:**
```bash
npm run build
```

**Link locally for testing:**
```bash
npm link
```

**Watch mode for development:**
```bash
npm run dev
```

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

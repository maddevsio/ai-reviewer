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
#For setting up global configuration run:

ai-review init --global
```

This interactive wizard will guide you through:
1. Selecting your AI provider (Claude)
2. Entering your AI provider API key
3. Choosing your git platform (GitHub / Bitbucket)
4. Platform-specific setup (workspace, repo, API token for Bitbucket)

### 2. Get Your API Key

**Anthropic (Claude):**
- Visit https://console.anthropic.com/
- Go to API Keys section
- Create a new API key
- Copy and paste it into the setup wizard

### 3. Platform-Specific Setup

**For GitHub:**

Install GitHub CLI:
```bash
# macOS
brew install gh
```

```bash
# Linux (Debian/Ubuntu)
sudo apt install gh
```

```bash
# Windows
winget install --id GitHub.cli
```

Authenticate:
```bash
gh auth login
```

**For Bitbucket:**

Create an API Token with required permissions:
- **Repositories**: Read, Write
- **Pull requests**: Read, Write

**API Token Setup:**
- Create at: https://bitbucket.org/account/settings/api-tokens/
- Select scopes: Repositories (Read, Write), Pull requests (Read, Write)
- Uses Bearer authentication

**Note:** App Passwords are deprecated and not supported. Creation disabled September 9, 2025; stops working June 9, 2026.

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

### Configuration Management

AI Code Review supports **hierarchical configuration** with automatic git-aware detection:

**Global Configuration (User-Wide):**
```bash
# Create global config (works anywhere)
ai-review init --global
```
- Stored at: `~/.config/ai-code-review-nodejs/config.json` (Linux) or `~/Library/Preferences/ai-code-review-nodejs/config.json` (macOS)
- Used as fallback when no local config exists

**Local Configuration (Per-Project):**
```bash
# Inside a git repository
cd ~/projects/my-repo
ai-review init
# ✓ Detected git repository
# ✓ Created ./.ai-review/config.json
```
- Stored at: `{repo-root}/.ai-review/config.json`
- Automatically detected from any subdirectory in the repo
- Overrides global config when present

**Configuration Priority:**
1. **Local config** (`.ai-review/config.json` at git repo root) - highest priority
2. **Global config** (`~/.config/ai-code-review-nodejs/config.json`) - fallback
3. **Defaults** - if no config found

**Example Workflow:**

Set up global config (personal projects default):
```bash
ai-review init --global
# Provider: Anthropic (Claude)
# Platform: GitHub
```

Set up local config for work project:
```bash
cd ~/work/company-repo
ai-review init
# Provider: Anthropic (Claude)
# Platform: Bitbucket
# Workspace: mycompany
# Repo: my-repo
# ...all Bitbucket fields
```

Use the tool (automatically picks local config):
```bash
ai-review pr
# Uses local config: Bitbucket + Claude
```

**Non-Git Repositories:**
If you run `ai-review init` outside a git repository, you'll see a warning:
```
⚠️  Warning: Not a git repository
Local config will only apply when running commands from ~/current-directory/
If you have git repos inside this directory, they will NOT use this config.

? Create local config anyway? (y/N)
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
- **Anthropic API Key** with sufficient credits
- **For GitHub**: GitHub CLI (`gh`) installed and authenticated
- **For Bitbucket**: API Token with Repositories and Pull requests permissions

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

### Bitbucket Authentication Failed

**Possible causes:**
- Invalid or expired API token
- Incorrect workspace or repo slug
- API token missing required permissions
- API token has been revoked

**Solution:**

1. Verify your configuration:
```bash
ai-review config list
```

2. Create or regenerate your API Token:
   - Create at: https://bitbucket.org/account/settings/api-tokens/
   - Required scopes: Repositories (Read, Write), Pull requests (Read, Write)

3. Update your API token:
```bash
ai-review config set bitbucket-app-password
# Enter your API Token
```

4. Verify other Bitbucket settings:
```bash
ai-review config set bitbucket-workspace
ai-review config set bitbucket-repo-slug
```

## FAQ

### Can I review my own PRs?

You can review and post comments on your own PRs, but GitHub prevents you from approving or requesting changes on PRs you created.

### What AI models are supported?

Currently, only Claude (Anthropic) is supported. A **free AI provider** (no API key or credits required) is coming soon in Phase 2 to remove the paywall barrier. OpenAI GPT-4 and Google Gemini support is planned for future releases.

### What git platforms are supported?

**GitHub** - Supported via GitHub CLI (`gh`)

**Bitbucket** - Supported via REST API with API Tokens (Bearer authentication)
- Create API Token at: https://bitbucket.org/account/settings/api-tokens/
- Required scopes: Repositories (Read, Write), Pull requests (Read, Write)

**Note:** App Passwords are deprecated and not supported.

**GitLab** - Coming in Phase 3

### How much does it cost?

The tool is free, but you need an Anthropic API key. API usage costs depend on:
- PR size (number of lines changed)
- Claude model used (defaults to Claude Sonnet 4.5)

Typical cost per review: $0.01-0.10 depending on PR size.

### Where is my configuration stored?

AI Code Review uses **hierarchical configuration**:

**Local Configuration (Project-Specific):**
- Location: `{git-repo-root}/.ai-review/config.json`
- Created with: `ai-review init` (when inside a git repository)
- Applies to: All commands run from anywhere inside the repository
- Priority: Overrides global config

**Global Configuration (User-Wide):**
- Location: `~/.config/ai-code-review-nodejs/config.json` (Linux) or `~/Library/Preferences/ai-code-review-nodejs/config.json` (macOS) or `%APPDATA%\ai-code-review-nodejs\config.json` (Windows)
- Created with: `ai-review init --global`
- Applies to: All commands when no local config exists
- Priority: Fallback

**Check Active Config:**
```bash
ai-review config list
# Using config from: ~/projects/my-repo/.ai-review/config.json
```

**Security Note:** API keys are stored in plain text locally. Keep your config directories secure and add `.ai-review/` to your `.gitignore` if you don't want to commit API keys.

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
- ✅ Hierarchical config resolution (local project overrides global)
- ✅ Git-aware config detection (auto-finds repo root)
- ✅ GitHub integration via `gh` CLI and Octokit API
- ✅ Bitbucket integration via REST API (app passwords)
- ✅ Anthropic (Claude) AI provider
- ✅ Full review workflow with interactive comment management
- ✅ Inline comment posting with line numbers
- ✅ PR approval/request changes workflow
- ✅ Demo mode with mock data
- ✅ Comprehensive CLI help

**Coming Next (Phase 2):**
- Free AI provider (no registration/credits required)
- Configurable review strictness levels (relaxed, balanced, strict, pedantic)
- Bitbucket OAuth 2.0 support (before June 2026 deadline)

**Future Plans:**
- GitLab support
- Additional AI providers (OpenAI GPT-4, Google Gemini)
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

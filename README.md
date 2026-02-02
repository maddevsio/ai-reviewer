# AI Code Review

AI-powered code review CLI tool for pull requests. Get intelligent feedback on your code changes using Claude AI, with support for GitHub and more platforms coming soon.

## Features

- 🤖 **AI-Powered Reviews** - Leverages Claude AI to provide intelligent, context-aware code reviews
- 🔄 **Interactive Workflow** - Review, accept, edit, or skip each AI suggestion
- 💬 **Inline Comments** - Posts comments directly on specific lines in your PRs
- ✅ **PR Approval** - Approve PRs, request changes, or leave comments only
- 🎯 **Configurable Strictness** - Choose review depth from easy (critical only) to pedantic (everything)
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

## Local Installation (Development)

To install and test the tool locally without publishing to npm:

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ai-code-review.git
cd ai-code-review

# Install dependencies
npm install

# Build the project
npm run build

# Create global symlink
npm link
```

Now you can use `ai-review` command anywhere on your system. Changes you make will be reflected after rebuilding.

**Verify Installation:**

```bash
which ai-review
ai-review --help
```

**Uninstall:**

```bash
npm unlink -g ai-code-review
```

**Development Workflow:**

```bash
# Make code changes
npm run build      # Rebuild

# Or use watch mode
npm run dev        # Auto-rebuild on changes
```

## Quick Start

### 1. Run Setup Wizard


```bash
#For setting up global configuration run:

ai-review init --global
```

This interactive wizard will guide you through:
1. Selecting your AI provider (Claude / Google Gemini)
2. Entering your AI provider API key
3. Choosing your git platform (GitHub / Bitbucket)
   - **Note:** Bitbucket requires local config (workspace/repo needed) - use `ai-review init` in your repository
4. Platform-specific setup (workspace, repo, API token for Bitbucket)
5. Optional: Review strictness level (easy, normal, balanced, strict, pedantic)

### 2. Get Your API Key

**Anthropic (Claude):**
- Visit https://console.anthropic.com/
- Go to API Keys section https://platform.claude.com/settings/keys
- Create a new API key
- Copy and paste it into the setup wizard
- Purchase credits

**Google (Gemini) - Free Tier:**
- Visit https://aistudio.google.com/
- Go to API Keys section https://aistudio.google.com/api-keys 
- Create a new API key (no credit card required)
- Copy and paste it into the setup wizard
- Select your preferred model:
  - **Gemini 3 Flash** - Most balanced model
  - **Gemini 2.5 Flash** - Best model in terms of price-performance (default)
- **Note:** Free tier has rate limits (requests per minute/day and tokens per minute)

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

**Important:** Bitbucket requires local configuration (workspace/repo specific). Run `ai-review init` inside your git repository.

Create an API Token with required permissions:
- **Repositories**: Read, Write
- **Pull requests**: Read, Write

**API Token Setup:**
- Create at: https://bitbucket.org/account/settings/api-tokens/
- Select scopes: Repositories (Read, Write), Pull requests (Read, Write)
- Uses Bearer authentication

**Note:** App Passwords are deprecated and not supported. Creation disabled September 9, 2025; stops working June 9, 2026.

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

**Set Google Gemini model (interactive):**
```bash
ai-review config set google-model
```

**Set review strictness (interactive):**
```bash
ai-review config set review-strictness
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
- **Note:** GitHub only - Bitbucket requires local config (workspace/repo specific)

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

### Review a Pull Request

**Interactive mode (lists all open PRs):**
```bash
ai-review pr
```

**Review specific PR:**
```bash
ai-review pr 342
```

**Review with specific strictness level:**
```bash
ai-review pr 342 --strictness pedantic
ai-review pr 342 -s easy
```

**Auto-post accepted comments:**
```bash
ai-review pr 342 --post
```

**Preview comments without posting:**
```bash
ai-review pr 342 --dry-run
#Will prompt user on finish whether one wants to save results in REVIEW.md file
```

### Review Strictness Levels

Control how thorough the AI review should be by choosing a strictness level:

**Available Levels:**

- **easy** - Only critical bugs, security vulnerabilities, and breaking changes
- **normal** - Important issues including bugs, security, performance, and significant best practice violations
- **balanced** - Balanced review covering bugs, security, performance, best practices, maintainability, and important style issues (recommended)
- **strict** - Strict code quality including comprehensive checks, naming conventions, documentation, and test coverage
- **pedantic** - Everything matters: all quality issues, style inconsistencies, documentation, formatting, and optimizations

**How to Set Strictness:**

1. **Per-review (flag)**: `ai-review pr --strictness pedantic` or `-s easy`
2. **Save as default**: `ai-review config set review-strictness balanced`
3. **During init**: Optionally set during setup wizard (can skip to be asked each time)

**Priority**: CLI flag > config setting > interactive prompt

If no strictness is configured, you'll be prompted to select one for each review.

### Verbose Logging

Debug and troubleshoot issues with category-based verbose logging.

**Available Categories:**

- **api** - Basic API logging (requests, responses, status codes)
- **api-detailed** - Full API details (URLs, headers, payloads, request/response bodies)
- **config** - Configuration loading and resolution paths
- **prompt** - AI prompt construction and token counts
- **diff** - Diff parsing details (files, additions, deletions)
- **platform** - Platform operations (GitHub/Bitbucket API calls)

**Usage:**

```bash
# Enable all categories
ai-review pr --verbose

# Enable specific category
ai-review pr --verbose=api

# Enable multiple categories
ai-review pr --verbose=api,config,platform

# Full API debugging
ai-review pr -v=api-detailed
```

**Example Output:**

```
[CONFIG] Resolved 'provider' from global config
[API] → Google Gemini request: gemini-2.5-flash
[DIFF] Parsed diff: 5 files, +120 -45 lines
[PROMPT] Constructed AI prompt: 2450 tokens, strictness=balanced, files=5
[API] Tokens: input=2450, output=850
[API] ← Google Gemini response: 200 (15234 bytes)
[PLATFORM] postComment: Posting inline comment to PR #123 at src/file.ts:45
```

Use `--verbose=api-detailed` to see full request/response bodies, headers, and payloads for deep debugging.

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
- **AI Provider API Key**:
  - **Anthropic (Claude)**: Paid API key with credits
  - **Google (Gemini)**: Free API key (subject to rate limits)
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

**Anthropic (Claude):** Rate limits depend on your API plan tier.

**Google (Gemini):** Free tier has rate limits on requests per minute/day and tokens per minute.

**Solution:** If you hit rate limits:
- Wait a few minutes before retrying
- For Google: Consider spacing out reviews or upgrading to paid tier for higher limits
- For Anthropic: Check your API key limits in the console or upgrade your plan

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

**Anthropic (Claude)** - Fully supported (requires paid API key)
**Google (Gemini)** - Fully supported with **free tier** (no credit card required)

OpenAI GPT-4 support is planned for future releases.

### What git platforms are supported?

**GitHub** - Supported via GitHub CLI (`gh`)

**Bitbucket** - Supported via REST API with API Tokens (Bearer authentication)
- Create API Token at: https://bitbucket.org/account/settings/api-tokens/
- Required scopes: Repositories (Read, Write), Pull requests (Read, Write)

**Note:** App Passwords are deprecated and not supported.

**GitLab** - Coming in Phase 3

### How much does it cost?

The tool is free. API costs depend on your provider choice:

**Google (Gemini)** - Free tier available (no credit card required)
- Choose between gemini-3-flash-preview or gemini-2.5-flash (default)
- Subject to rate limits on free tier (requests per minute/day, tokens per minute)
- Suitable for testing and small teams with occasional reviews

**Anthropic (Claude)** - Paid API key required
- Defaults to Claude Sonnet 4.5
- Typical cost per review: $0.01-0.10 depending on PR size

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

Yes! Use review strictness levels to control how thorough the AI review should be:

- **easy** - Only critical issues (bugs, security, breaking changes)
- **normal** - Important issues and best practices
- **balanced** - Comprehensive review (recommended default)
- **strict** - Strict quality standards with thorough checks
- **pedantic** - Everything matters, no detail overlooked

Set via flag (`-s strict`), config (`ai-review config set review-strictness`), or you'll be prompted during each review if not configured.

### Does it work offline?

No, the tool requires:
- Internet connection
- Access to Anthropic API
- Access to GitHub (if reviewing GitHub PRs)

### What programming languages are supported?

The tool works with any programming language. Claude AI can review code in most popular languages including JavaScript, TypeScript, Python, Go, Rust, Java, C++, and many more.

### How do I debug or troubleshoot issues?

Use the `--verbose` flag with category-based logging:

```bash
# See all debug output
ai-review pr --verbose

# Debug specific issues
ai-review pr --verbose=api          # API rate limits or connection issues
ai-review pr --verbose=config       # Configuration resolution problems
ai-review pr --verbose=api-detailed # Full API request/response details
```

Available categories: `api`, `api-detailed`, `config`, `prompt`, `diff`, `platform`. See the "Verbose Logging" section for detailed information.

## Current Status

✅ **MVP Complete** - Core features fully implemented

**Implemented:**
- ✅ Configuration management with interactive setup
- ✅ Hierarchical config resolution (local project overrides global)
- ✅ Git-aware config detection (auto-finds repo root)
- ✅ GitHub integration via `gh` CLI and Octokit API
- ✅ Bitbucket integration via REST API (API Tokens)
- ✅ Anthropic (Claude) AI provider
- ✅ Google (Gemini) AI provider with free tier
- ✅ Configurable review strictness levels (easy, normal, balanced, strict, pedantic)
- ✅ Verbose logging with category-based debugging (api, api-detailed, config, prompt, diff, platform)
- ✅ Full review workflow with interactive comment management
- ✅ Inline comment posting with line numbers
- ✅ PR approval/request changes workflow
- ✅ Demo mode with mock data
- ✅ Comprehensive CLI help

**Future Plans:**
- GitLab support
- OpenAI GPT-4 provider
- Project-specific review guidelines (`.aireview` file)

## Development Setup

**Clone the repository and navigate to the project's directory**

**Install dependencies:**
```bash
npm install
```

**Build the project:**
```bash
npm run build
```

**Link locally:**
```bash
npm link
```

**Run:**
```bash
ai-review help
```
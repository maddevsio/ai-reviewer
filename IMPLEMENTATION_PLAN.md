# AI Code Reviewer - Implementation Plan

## Overview
A CLI tool that performs AI-powered code reviews on pull requests from GitHub, GitLab, and Bitbucket. Phase 1 focuses on GitHub support with extensible architecture for future platforms.

---

## Phase 1: Foundation & GitHub Support ✅

### 1. Project Initialization ✅

#### 1.1 Setup Project Structure ✅
- Create directory structure for modular codebase
- Separate concerns: config, providers, platforms, UI, core logic
- Define folder structure: `/src/config`, `/src/providers`, `/src/platforms`, `/src/ui`, `/src/core`, `/src/utils`

#### 1.2 Choose Technology Stack ✅
- Decide on programming language (Node.js/TypeScript, Python, Go, Rust, etc.)
- Select CLI framework for argument parsing and commands
- Choose interactive UI library for menus and prompts
- Select HTTP client library for API calls
- Choose testing framework

#### 1.3 Initialize Development Environment ✅
- Setup package manager and dependency management
- Configure linter and formatter
- Setup version control (git)
- Create initial README with project description
- Define `.gitignore` for language-specific artifacts

---

### 2. Configuration Management ✅

#### 2.1 Design Configuration Schema ✅
- Define configuration structure (provider, API keys, platform, preferences)
- Decide on configuration file format (JSON, YAML, TOML)
- Define configuration file location (`~/.config/ai-review/` or similar)

#### 2.2 Implement Configuration Module ✅
- Create configuration loader that reads from config file
- Implement configuration writer for saving settings
- Add configuration validation
- Handle missing or malformed configuration gracefully

#### 2.3 Build Configuration CLI Commands ✅
- Implement `config set <key> <value>` command
- Implement `config get <key>` command
- Implement `config list` command to show all settings
- Implement `config delete <key>` command
- ✅ Add `config init` command for interactive setup wizard
  - Guide users through AI provider selection (anthropic/openai/google)
  - Prompt for API key with masked input
  - Ask for platform preference (github/gitlab/bitbucket)
  - Validate inputs before saving
  - ✅ **UX Improvement**: Auto-trigger this wizard on first `ai-review pr` run if config is missing

---

### 3. AI Provider Abstraction Layer ✅

#### 3.1 Define Provider Interface ✅
- Create abstract interface/base class for AI providers
- Define method: `sendPrompt(prompt, context)` → response
- Define method: `validateCredentials()` → boolean
- Define error handling contract for all providers

#### 3.2 Implement Anthropic Provider (Claude) ✅
- Implement Anthropic API integration
- Handle API authentication with API key
- Implement prompt sending and response parsing
- Add rate limiting and error handling
- Handle token limits and context windows

#### 3.3 Add Provider Factory ✅
- Create factory pattern to instantiate correct provider based on config
- Validate provider selection at runtime
- Provide helpful error messages for missing API keys

---

### 4. Git Platform Abstraction Layer ✅

#### 4.1 Define Platform Interface ✅
- Create abstract interface/base class for git platforms
- Define method: `listPullRequests()` → PR[]
- Define method: `getPullRequestDiff(id)` → string
- Define method: `getPullRequestMetadata(id)` → metadata object
- Define method: `postComment(prId, comment, options)` → void
- Define method: `isAuthenticated()` → boolean
- Define common data structures (PR, Comment, File, etc.)

#### 4.2 Design Platform-Agnostic Data Models ✅
- Create PR model (id, title, author, status, updated_at, etc.)
- Create File model (path, additions, deletions, patch)
- Create Comment model (body, line, path, position)
- Create Author model (username, name, avatar)

---

### 5. GitHub Integration ✅

#### 5.1 Detect GitHub CLI Availability ✅
- Check if `gh` CLI is installed on system
- Verify `gh` CLI is authenticated (`gh auth status`)
- Provide helpful error messages if `gh` not found or not authenticated
- Add instructions for installing and authenticating `gh` CLI

#### 5.2 Implement GitHub Platform Adapter ✅
- Implement `listPullRequests()` using `gh pr list --json`
- Parse JSON output into platform-agnostic PR models
- Implement error handling for `gh` CLI failures

#### 5.3 Fetch Pull Request Details ✅
- Implement `getPullRequestDiff(id)` using `gh pr diff <id>`
- Implement `getPullRequestMetadata(id)` using `gh pr view <id> --json`
- Parse PR description, comments, labels, assignees
- Handle large diffs efficiently

#### 5.4 Implement Comment Posting ✅
- Implement `postComment()` using `gh pr comment <id>`
- Support inline comments on specific lines
- Support general PR comments
- Handle comment threading if needed

#### 5.5 Detect Repository Context ✅
- Auto-detect if current directory is a git repository
- Extract repository owner and name from git remote
- Verify repository is on GitHub
- Handle multiple remotes gracefully

---

### 6. Core Review Logic ✅

#### 6.1 Design Prompt Engineering ✅
- Create base prompt template for code review
- Define what aspects to review (bugs, performance, security, style, etc.)
- Include instructions for structured output format
- Design prompt to request specific line numbers and file paths

#### 6.2 Implement Context Building ✅
- Gather PR metadata (title, description, author)
- Combine all changed files into single context
- Include file paths and line numbers
- 🚧 **Load and include project-specific guidelines from `.aireview` file** (see section 2.4)
- Optionally include additional project context (README, CONTRIBUTING.md)
- Format all context for optimal AI understanding

#### 6.3 Implement Diff Analysis ✅
- Parse git diff format
- Extract changed files with additions/deletions
- Map line numbers from diff to actual file positions
- Handle binary files appropriately

#### 6.4 Send Review Request to AI ✅
- Construct complete prompt with context and diff
- Send to configured AI provider
- Handle streaming responses if supported
- Parse AI response into structured format

#### 6.5 Parse AI Response ✅
- Extract individual review comments from AI response
- Parse file paths, line numbers, and severity
- Structure comments into internal format
- Validate AI response format

---

### 7. Interactive User Interface ✅

#### 7.1 Implement PR Selection Menu ✅
- Display list of open PRs with metadata
- Show PR number, title, author, and last updated time
- Allow user to navigate with arrow keys
- Allow user to select PR with Enter
- Add option to refresh list
- Add option to exit

#### 7.2 Display Review Progress ✅
- Show loading indicator while fetching PR
- Display progress while AI analyzes code
- Show number of files being reviewed
- Indicate when review is complete

#### 7.3 Implement Comment Review Interface ✅
- Display each AI-suggested comment one by one
- Show file path and line number
- Display code context (before/after with diff highlighting)
- Show AI's comment and reasoning
- Present options: Accept / Edit / Skip / Quit

#### 7.4 Implement Comment Editing ✅
- Allow user to edit AI-generated comment
- Open text editor (use $EDITOR environment variable)
- Validate edited comment before proceeding

#### 7.5 Display Diff with Highlighting ✅
- Show code context around the flagged line
- Highlight additions in green, deletions in red
- Show line numbers
- Provide enough context (e.g., 5 lines before/after)
- ✅ **UX Enhancement**: Improve diff color scheme
  - Use background colors + text colors for better visual distinction (like git diff or IDE previews)
  - Consider using `chalk.bgRed` for deletions and `chalk.bgGreen` for additions
  - Add dimmed/gray color for unchanged context lines
  - Ensure colors are accessible and work well in both light/dark terminals

---

### 8. Comment Management ✅

#### 8.1 Implement Comment Queue ✅
- Store all AI-generated comments in memory
- Track which comments have been processed
- Track which comments are accepted/skipped/edited
- Allow navigation forward/backward through comments

#### 8.2 Implement Batch Comment Submission ✅
- Collect all accepted/edited comments
- Submit all comments at once to platform
- Handle submission failures gracefully
- Provide confirmation of successful submission

#### 8.3 Add Comment Filtering 🚧
- 🚧 Allow filtering by severity (if AI provides severity levels)
- 🚧 Allow filtering by file or file type
- 🚧 Allow user to review only specific categories

#### 8.4 PR Approval Feature ✅
- ✅ Allow PR approval after review
  - After posting comments (or choosing not to), prompt user with menu of review actions
  - Option to approve even with minor suggestions/comments
  - Use GitHub API to submit PR review with approval status
  - Display choices:
    - "Approve PR" - Submit approval
    - "Request changes" - Mark PR as needing changes
    - "Comment only" - Leave comments without approval status
    - "Skip" - Don't submit any review status
  - **Safety confirmation**: For "Approve" and "Request changes", require user to type "yes" to confirm
  - Show confirmation message with review status
  - Works in both real reviewer and demo mode
  - Skipped in dry-run mode

---

### 9. CLI Command Structure ✅

#### 9.1 Design Command Hierarchy ✅
- Root command: `ai-review`
- Subcommand: `ai-review config <action>`
- Subcommand: `ai-review pr [options]`
- Subcommand: `ai-review pr <id> [options]`
- Add `--help` flag for all commands

#### 9.2 Implement Root Command ✅
- Show help text by default
- Display version with `--version` flag
- Show available subcommands
- 🚧 **NEW FEATURE: Interactive REPL Mode**
  - When running `ai-review` without arguments, enter interactive mode
  - Display a prompt where user can type commands without `ai-review` prefix
  - Commands: `pr`, `config list`, `config set <key> <value>`, `help`, `exit`
  - Maintain session state (keep loaded configuration, current repo context)
  - Show nice prompt with current directory/repo name
  - Use `inquirer` or similar for command input with autocomplete
  - Allow `Ctrl+C` or `exit` to quit interactive mode

#### 9.3 Implement PR Review Command ✅
- ✅ `ai-review pr` - Interactive mode, lists PRs and lets user select
- ✅ `ai-review pr <id>` - Review specific PR directly
- ✅ Add `--post` flag to automatically post comments
- ✅ Add `--dry-run` flag to show comments without posting
- ✅ **Improved help output to show all commands with options**
  - When user runs `ai-review --help`, shows comprehensive help including:
    - All available commands (init, config, pr) with detailed descriptions
    - Options for each command with clear explanations
    - Examples for common use cases
    - Detailed breakdown of config subcommands (set, get, list, delete)
  - Individual command help (e.g., `ai-review pr --help`) shows detailed info for that command

#### 9.4 Add Global Options 🚧
- 🚧 `--config` flag to specify custom config file path
- 🚧 `--verbose` flag for debug output
- 🚧 `--quiet` flag to suppress non-essential output

---

### 10. Error Handling ✅

#### 10.1 Handle Platform Errors ✅
- Gracefully handle missing `gh` CLI
- Handle authentication failures
- Handle network errors
- Handle PR not found errors
- Handle permission errors (private repos)

#### 10.2 Handle AI Provider Errors ✅
- Handle missing or invalid API keys
- Handle rate limiting
- Handle context window exceeded
- Handle API service outages
- Provide retry mechanism with exponential backoff

#### 10.3 Handle Git Errors ✅
- Handle not in a git repository
- Handle unsupported platform (not GitHub)
- Handle missing remote
- Handle corrupted git repository

#### 10.4 User-Friendly Error Messages ✅
- Provide clear, actionable error messages
- Suggest solutions for common problems
- Include links to documentation where relevant

---

### 11. Documentation 🚧

#### 11.1 User Documentation ✅
- ✅ Write essential README with installation instructions
- ✅ Expand README to comprehensive documentation (troubleshooting, FAQ, advanced usage)
- ✅ Document all CLI commands with examples (in CLI help and README)
- ✅ Create configuration guide (Quick Start section with step-by-step instructions)
- ✅ Add troubleshooting section (common errors with solutions)
- ✅ Add FAQ section (covers cost, platforms, models, offline usage, languages, etc.)

#### 11.2 Developer Documentation 🚧
- 🚧 Document architecture and design decisions
- 🚧 Create contribution guidelines
- 🚧 Document how to add new AI providers
- 🚧 Document how to add new platforms (for Phase 2)

#### 11.3 Examples and Tutorials 🚧
- 🚧 Provide example configuration files
- 🚧 Create step-by-step tutorial for first-time users
- 🚧 Add video demo or GIF showing tool in action

---

### 12. Packaging and Distribution 🚧

#### 12.1 Setup Build Process 🚧
- 🚧 Configure build scripts for target platforms
- 🚧 Setup executable generation
- 🚧 Configure asset bundling if needed

#### 12.2 Package for Distribution 🚧
- 🚧 Publish to npm (if Node.js/TypeScript)
  - **NOTE**: Current package name is `ai-code-review` (command: `ai-review`)
  - Both `ai-review` and `ai-reviewer` are already taken on npm
  - Consider alternatives before publishing: scoped package `@username/ai-review`, `claude-code-review`, `ai-pr-review`, etc.
- 🚧 Publish to PyPI (if Python)
- 🚧 Create Homebrew formula (for macOS)
- 🚧 Create apt/yum packages (for Linux)
- 🚧 Build Windows installer

#### 12.3 Setup Versioning 🚧
- 🚧 Use semantic versioning (semver)
- 🚧 Setup automated version bumping
- 🚧 Tag releases in git

#### 12.4 Setup CI/CD 🚧
- 🚧 Configure automated testing on push
- 🚧 Setup automated builds
- 🚧 Configure automated publishing on release tags

---

## Phase 2: GitLab Support 🚧

### 14. GitLab Integration 🚧

#### 14.1 Detect GitLab CLI Availability 🚧
- 🚧 Check if `glab` CLI is installed
- 🚧 Verify `glab` CLI is authenticated
- 🚧 Provide installation/authentication instructions

#### 14.2 Implement GitLab Platform Adapter 🚧
- 🚧 Implement interface methods using `glab` CLI
- 🚧 Map GitLab merge requests to PR model
- 🚧 Handle GitLab-specific features (approval rules, etc.)

#### 14.3 Test GitLab Integration 🚧
- 🚧 Test on real GitLab repositories
- 🚧 Verify comment posting works correctly
- 🚧 Test with GitLab-specific edge cases

---

## Phase 3: Bitbucket Support 🚧

### 15. Bitbucket API Integration 🚧

#### 15.1 Study Bitbucket API 🚧
- 🚧 Review Bitbucket REST API documentation
- 🚧 Understand authentication (app passwords, OAuth)
- 🚧 Understand PR structure and diff format

#### 15.2 Implement Bitbucket Platform Adapter 🚧
- 🚧 Implement direct API calls (no CLI available)
- 🚧 Implement authentication handling
- 🚧 Map Bitbucket pull requests to PR model
- 🚧 Handle Bitbucket-specific features

#### 15.3 Add Bitbucket Configuration 🚧
- 🚧 Add config fields for workspace and repository
- 🚧 Add config field for Bitbucket app password
- 🚧 Update configuration commands to support Bitbucket

#### 15.4 Test Bitbucket Integration 🚧
- 🚧 Test on real Bitbucket repositories
- 🚧 Verify comment posting works correctly
- 🚧 Handle Bitbucket Cloud vs Server differences if needed

---

## Phase 4: Advanced Features (Future) 🚧

### 16. Enhanced Review Capabilities 🚧
- 🚧 Configurable review strictness levels (relaxed, balanced, strict, pedantic) to control how many comments AI generates
- 🚧 Support for reviewing specific commits
- 🚧 Support for reviewing local changes before pushing
- 🚧 Support for comparing branches
- 🚧 Custom review rules and guidelines per repository
- 🚧 Integration with existing code quality tools

### 17. Performance Optimizations 🚧
- 🚧 Implement caching for large PRs
- 🚧 Optimize diff parsing for very large changes
- 🚧 Parallelize file reviews if possible
- 🚧 Stream AI responses for real-time feedback

### 18. Collaboration Features 🚧
- 🚧 Support for team review workflows
- 🚧 Integration with Slack/Discord for notifications
- 🚧 Review summary reports
- 🚧 Analytics on review quality and frequency

### 19. Additional AI Providers 🚧
- 🚧 Implement OpenAI Provider (GPT-4, GPT-4-turbo)
- 🚧 Implement Google Gemini Provider
- 🚧 Add support for switching between providers dynamically

### 20. Project-Specific Configuration 🚧
- 🚧 Support for `.aireview` or `.ai-review.json` file in project root
- 🚧 Project-specific review guidelines (coding standards, architecture patterns, security requirements)
- 🚧 Interactive wizard to create project guidelines
- 🚧 Merge project config with global config (project takes precedence)
- 🚧 Include project guidelines in AI review prompts for context-aware reviews

### 21. Testing Infrastructure 🚧
- 🚧 Unit tests for configuration management
- 🚧 Unit tests for AI provider abstraction and implementations
- 🚧 Unit tests for platform adapter interface
- 🚧 Unit tests for diff parsing logic
- 🚧 Integration tests for GitHub integration with mocks
- 🚧 End-to-end tests with mocked APIs
- 🚧 Automated test suite in CI/CD pipeline

